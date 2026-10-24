# Firebase identity-verification security setup

The Firestore rules in `firestore.rules` protect the `id_verifications` collection and prevent citizens from changing their own review status or role. Verification images are stored inside those documents, so the same document rules protect both the ID image and selfie. These rules do not secure other collections: the final compatibility rule still permits the existing app's other collections and must be replaced collection-by-collection before those records can be considered private.

## Before deploying

1. In Firebase Console → Authentication → Users, identify the real administrator's Firebase Auth account and copy its UID. Do not use the demo `admin/admin123` login; it is not a Firebase identity and grants no Firestore administrator access.
2. In a trusted Google Cloud Shell signed in as a project administrator, select project `marbslf`, then run the following. Replace `REAL_ADMIN_UID` with the UID you verified. The script preserves any existing custom claims while adding `admin: true`.

```sh
mkdir -p /tmp/marbslf-admin-claim && cd /tmp/marbslf-admin-claim
npm init -y
npm install firebase-admin
node -e 'const admin=require("firebase-admin"); (async()=>{admin.initializeApp({projectId:"marbslf"}); const uid=process.argv[1]; if(!uid) throw new Error("Pass the verified Firebase Auth UID"); const user=await admin.auth().getUser(uid); await admin.auth().setCustomUserClaims(uid,{...(user.customClaims||{}),admin:true}); console.log("Admin claim set for",uid)})().catch(e=>{console.error(e);process.exit(1)})' REAL_ADMIN_UID
```

3. Sign out and back in with that Firebase account so its ID token refreshes and includes the new claim. Keep at least one tested administrator account before removing any previous access path.
4. From the repository root, install dependencies and run `npm run test:rules`. The tests use the Firestore Emulator and cover owner/stranger access, pending-only citizen submissions, and admin-only review.
5. Only after the tests pass and the administrator account is confirmed, deploy with:

```sh
node "C:/Users/ianca/AppData/Roaming/npm/node_modules/firebase-tools/lib/bin/firebase.js" deploy --only firestore:rules --project marbslf
```

Rule deployment is separate from the GitHub source push. After deployment, sign in as the real admin and verify that the admin can review a test submission while a second ordinary account cannot read it. Do not use real identity documents for access-control tests.

## Important limitations

- A custom claim must be granted only by trusted server-side code or an administrator using the Firebase Admin SDK. Never expose service-account credentials or a claim-setting endpoint in the browser.
- Citizens can create their own pending verification record only. Only a Firebase Auth user with the `admin: true` custom claim can read all submissions or update review status.
- An ID document created under older, permissive rules may already have been read by other clients. Deploying stricter rules prevents future unauthorized reads; it cannot undo prior exposure.
- Define an actual retention/deletion process and update the consent notice before promising a specific retention period.
- The app's existing non-identity Firestore collections remain permissive under a compatibility rule. Audit and replace that rule before storing other private data there.
