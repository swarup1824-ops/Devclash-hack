import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure ffmpeg is correctly configured
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}
// ffprobe-static usually exports the path directly or as a property depending on the version/environment
const actualProbePath = (ffprobePath as any).path || ffprobePath;
if (actualProbePath) {
  ffmpeg.setFfprobePath(actualProbePath);
}

// Multi-chunk upload storage
const chunksDir = path.join('uploads', 'chunks');
if (!fs.existsSync(chunksDir)) fs.mkdirSync(chunksDir, { recursive: true });

const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB per chunk limit
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  // Global error handler for JSON vs HTML
  app.use((err: any, req: any, res: any, next: any) => {
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Laboratory chunk limit exceeded. Max 50MB per request.' });
    }
    next(err);
  });

  // Ensure uploads directory exists
  if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
  }

  // --- API: HEALTH ---
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', engine: 'Laboratory-Alpha' });
  });

  // --- API: UPLOAD CHUNK ---
  app.post('/api/upload-chunk', upload.single('chunk'), (req, res) => {
    const { jobId, chunkIndex, totalChunks } = req.body;
    if (!req.file || !jobId) return res.status(400).json({ error: 'Incomplete chunk data' });

    const jobDir = path.join(chunksDir, jobId);
    if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

    const chunkPath = path.join(jobDir, `part_${chunkIndex}`);
    fs.renameSync(req.file.path, chunkPath);

    res.json({ success: true, chunkIndex });
  });

  // --- API: FINALIZE SPLIT ---
  app.post('/api/finalize-split', async (req, res) => {
    const { jobId, totalChunks, originalName } = req.body;
    if (!jobId || !totalChunks) return res.status(400).json({ error: 'Invalid finalization request' });

    const jobDir = path.join(chunksDir, jobId);
    // Assemble chunks using streams for efficiency
    try {
      const finalPath = path.join('uploads', `${jobId}_assembled${path.extname(originalName)}`);
      const writeStream = fs.createWriteStream(finalPath);
      
      let currentChunk = 0;
      const appendNextChunk = () => {
        if (currentChunk < totalChunks) {
          const chunkPath = path.join(jobDir, `part_${currentChunk}`);
          const readStream = fs.createReadStream(chunkPath);
          
          readStream.pipe(writeStream, { end: false });
          readStream.on('end', () => {
            fs.unlinkSync(chunkPath); // Clean up
            currentChunk++;
            appendNextChunk();
          });
          readStream.on('error', (err) => {
            console.error('Read Stream Error:', err);
            res.status(500).json({ error: 'Failed to read media chunk.' });
          });
        } else {
          writeStream.end();
        }
      };

      appendNextChunk();
      
      writeStream.on('finish', () => {
        fs.rmSync(jobDir, { recursive: true, force: true });
        triggerSplit(finalPath, jobId, originalName, res);
      });
      writeStream.on('error', (err) => {
        console.error('Write Stream Error:', err);
        res.status(500).json({ error: 'Failed to assemble media.' });
      });
    } catch (err) {
      console.error('Assembly Error:', err);
      res.status(500).json({ error: 'Failed to assemble media chunks.' });
    }
  });

  function triggerSplit(filePath: string, jobId: string, originalName: string, res: any) {
    const outputDir = path.join('uploads', `job_${jobId}`);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error('Probe Error:', err);
        return res.status(500).json({ error: 'Failed to analyze media structure.' });
      }

      const duration = metadata.format.duration || 0;
      let segmentDuration = 30; 

      if (duration < 120) {
        segmentDuration = 30;
      } else if (duration < 600) {
        segmentDuration = 60;
      } else if (duration < 1800) {
        segmentDuration = 120;
      } else {
        segmentDuration = 300;
      }

      console.log(`[Job ${jobId}] Assembled. Splitting into ${segmentDuration}s chunks.`);

      const ext = path.extname(originalName) || '.webm';
      const outputPattern = path.join(outputDir, `chunk_%03d${ext}`);

      ffmpeg(filePath)
        .outputOptions([
          '-f segment',
          `-segment_time ${segmentDuration}`,
          '-reset_timestamps 1',
          '-map 0',
          '-c copy',
          '-avoid_negative_ts make_zero',
          '-segment_format_options movflags=faststart'
        ])
        .output(outputPattern)
        .on('end', () => {
          const files = fs.readdirSync(outputDir)
            .filter(f => f.startsWith('chunk'))
            .sort();
          
          if (files.length === 0) {
             console.error('Segmentation failed: No chunks generated.');
             return res.status(500).json({ error: 'Critical failure: No media segments were generated.' });
          }
            
          res.json({
            jobId,
            totalDuration: duration,
            segmentDuration,
            segments: files.map((f, i) => ({
              id: i,
              filename: f,
              url: `/api/chunk/${jobId}/${f}`
            }))
          });
          
          fs.unlinkSync(filePath); // Cleanup assembled file after split
        })
        .on('error', (splitErr) => {
          console.error('Split Error:', splitErr);
          // Fallback transcode logic...
          const fallbackPattern = path.join(outputDir, `chunk_%03d${ext}`);
          ffmpeg(filePath)
            .outputOptions(['-f segment', `-segment_time ${segmentDuration}`, '-reset_timestamps 1', '-map 0'])
            .videoCodec('libx264')
            .audioCodec('aac')
            .outputOptions(['-preset superfast', '-crf 28'])
            .output(fallbackPattern)
            .on('end', () => {
                const files = fs.readdirSync(outputDir).filter(f => f.startsWith('chunk')).sort();
                res.json({ jobId, totalDuration: duration, segmentDuration, segments: files.map((f, i) => ({ id: i, filename: f, url: `/api/chunk/${jobId}/${f}` })) });
                fs.unlinkSync(filePath);
            })
            .on('error', (fallbackErr) => {
              res.status(500).json({ error: 'Segmenting failed after fallback.' });
              fs.unlinkSync(filePath);
            })
            .run();
        })
        .run();
    });
  }

  // --- API: SERVE CHUNK ---
  app.get('/api/chunk/:jobId/:filename', (req, res) => {
    const { jobId, filename } = req.params;
    const chunkPath = path.join('uploads', `job_${jobId}`, filename);
    
    if (fs.existsSync(chunkPath)) {
      res.sendFile(path.resolve(chunkPath));
    } else {
      res.status(404).send('Chunk not found');
    }
  });

  // --- Vite Middleware for Development ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Laboratory Engine running on port ${PORT}`);
  });
}

startServer();
