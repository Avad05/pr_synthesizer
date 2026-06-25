import { retrieveRelevantChunks, formatContext } from '../server/src/retriever.js';

// Simulate a diff that touches auth logic
const testDiff = `
diff --git a/api/src/controllers/authController.js b/api/src/controllers/authController.js
+const token = jwt.sign({ userId }, process.env.JWT_SECRET || "hardcoded-fallback");
+console.log('token:', token);
`;

const chunks = await retrieveRelevantChunks('Avad05/Blog-API', testDiff, 3);
console.log('Retrieved chunks:');
console.log(formatContext(chunks));