# Security Specification: WhyNotHired

## Data Invariants
1. **User Profiles**: Every user must have a unique profile mapped to their Auth UID. Users can only read and write their own profile records.
2. **Interviews**: Every interview result must be associated with a `userId`. Users can only access interview results where `userId` matches their Auth UID.
3. **Consistency**: `createdAt` timestamps must be server-generated and immutable.
4. **Validation**: All user-provided strings and scores must be size-bounded and type-safe.

## Dirty Dozen Payloads (Target: DENY)

### Identity & Spoofing
1. **Profile Hijack**: Attempt to `create` a profile in `users/attacker_uid` where `uid` is `victim_uid`.
2. **Interview Impersonation**: Attempt to `create` an interview result for `victim_uid`.
3. **Cross-User Read**: Authenticated user `A` attempts to `get` an interview belonging to user `B`.
4. **List Scraping**: Authenticated user attempts to `list` all interviews without a `where` clause filter (Rule must evaluate `resource.data`).

### Integrity & Schema
5. **Ghost Field Injection**: Attempt to `update` a user profile with an unauthorized field (e.g., `isAdmin: true`).
6. **Immutable Tampering**: Attempt to `update` a profile to change its `uid` or `createdAt`.
7. **Score Poisoning**: Attempt to `create` an interview with `score: 999`.
8. **Malicious ID**: Attempt to `create` a document with a 1MB string as the Document ID.

### Resource Exhaustion (Denial of Wallet)
9. **Giant String Payload**: Attempt to `create` a profile with a 500KB `fullName`.
10. **Array Explosion**: (N/A if no arrays, but verify schema doesn't allow unbounded lists).

### Temporal & State
11. **Future Timestamp**: Attempt to `create` a record with a client-side `createdAt` set to the future.
12. **Status Shortcut**: (N/A currently, but ensuring `createdAt` is immutable satisfies this).

## Test Runner (Verification)
See `firestore.rules.test.ts` for automated verification of these payloads.
