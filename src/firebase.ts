import admin from 'firebase-admin';

function getPrivateKey(): string | undefined {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  return key ? key.replace(/\\n/g, '\n') : undefined;
}

function getServiceAccountFromBase64(): admin.ServiceAccount | undefined {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encoded) return undefined;

  const json = Buffer.from(encoded, 'base64').toString('utf8');
  return JSON.parse(json) as admin.ServiceAccount;
}

if (!admin.apps.length) {
  const serviceAccount = getServiceAccountFromBase64();

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: getPrivateKey(),
      }),
    });
  } else {
    admin.initializeApp();
  }
}

export const auth = admin.auth();
export const db = admin.firestore();
