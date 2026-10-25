# Firebase identity-verification security setup

The Firestore rules in `firestore.rules` protect the `id_verifications` collection, allow admins to erase ID/selfie image fields after a final review, keep abuse reports private to their reporter and admins, make admin audit logs private and append-only, and prevent citizens from changing their own review status or role. The final compatibility rule still permits many other existing app collections; those must be secured collection-by-collection before their contents can be considered private.

## Before deploying

1. In Firebase Console → Authentication → Users, identify the real administrator's Firebase Auth account and copy its UID. Do not use the demo `admin/admin123` login; it is not a Firebase identity and grants no Firestore administrator access.
2. In a trusted Google Cloud Shell signed in as a project administrator, select project `marbslf`, then run the following. Replace `REAL_ADMIN_UID` with the UID you verified. The script preserves any existing custom claims while adding `admin: true`.

```sh
mkdir -p /tmp/marbslf-admin-claim && cd /tmp/marbslf-admin-claim
npm init -y
npm install firebase-admin
node -e 'const {initializeApp}=require("firebase-admin/app"); const {getAuth}=require("firebase-admin/auth"); (async()=>{initializeApp({projectId:"marbslf"}); const auth=getAuth(); const uid=process.argv[1]; if(!uid) throw new Error("Pass the verified Firebase Auth UID"); const user=await auth.getUser(uid); await auth.setCustomUserClaims(uid,{...(user.customClaims||{}),admin:true}); console.log("Admin claim set for",uid)})().catch(e=>{console.error(e);process.exit(1)})' REAL_ADMIN_UID
```

3. Sign out and back in with that Firebase account so its ID token refreshes and includes the new claim. Keep at least one tested administrator account before removing any previous access path.
4. From the repository root, install dependencies and run `npm run test:rules`. The tests use the Firestore Emulator and cover private verification/abuse reports/audit logs, admin review and image deletion, and the two-participant return confirmation.
5. Only after the tests pass and the administrator account is confirmed, deploy with:

```sh
node "C:/Users/ianca/AppData/Roaming/npm/node_modules/firebase-tools/lib/bin/firebase.js" deploy --only firestore:rules --project marbslf
```

Rule deployment is separate from the GitHub source push. After deployment, sign in as the real admin and verify that the admin can review a test submission while a second ordinary account cannot read it. Do not use real identity documents for access-control tests.

## Important limitations

- A custom claim must be granted only by trusted server-side code or an administrator using the Firebase Admin SDK. Never expose service-account credentials or a claim-setting endpoint in the browser.
- Citizens can create their own pending verification record only. Only a Firebase Auth user with the `admin: true` custom claim can read all submissions or update review status.
- An ID document created under older, permissive rules may already have been read by other clients. Deploying stricter rules prevents future unauthorized reads; it cannot undo prior exposure.
- Reviewed ID/selfie images can be deleted manually by an admin from the verification details screen. There is no automatic age-based deletion schedule; do not promise a fixed retention period until one is implemented and approved.
- The app's existing non-identity Firestore collections remain permissive under a compatibility rule. Audit and replace that rule before storing other private data there.
