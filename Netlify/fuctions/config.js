const admin = require("firebase-admin");

// ─── Inicializa o Firebase Admin só uma vez (reutiliza entre chamadas) ────────
// No painel Netlify → Environment Variables, adicione:
//   FIREBASE_PROJECT_ID          → seu project ID
//   FIREBASE_CLIENT_EMAIL        → client_email do serviceAccountKey.json
//   FIREBASE_PRIVATE_KEY         → private_key do serviceAccountKey.json
//
// Para obter o serviceAccountKey.json:
//   Firebase Console → Configurações do projeto → Contas de serviço → Gerar nova chave privada

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  // Preflight CORS
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST")    return { statusCode: 405, headers, body: JSON.stringify({ erro: "Método não permitido" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ erro: "Body inválido" }) }; }

  const { acao } = body;

  // ── VERIFICAR TOKEN ────────────────────────────────────────────────────────
  // O frontend envia o idToken gerado pelo Firebase Auth no browser.
  // A função verifica se é legítimo — sem expor nenhuma chave.
  //
  // No seu frontend, após o login com Firebase Auth:
  //   const idToken = await firebase.auth().currentUser.getIdToken();
  //   fetch("/.netlify/functions/firebase", {
  //     method: "POST",
  //     body: JSON.stringify({ acao: "verificar", idToken })
  //   });
  if (acao === "verificar") {
    const { idToken } = body;
    if (!idToken) return { statusCode: 400, headers, body: JSON.stringify({ erro: "idToken ausente" }) };

    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok:    true,
          uid:   decoded.uid,
          email: decoded.email,
          // Retorna a role do usuário se você usa Custom Claims
          // Ex: decoded.role → "supervisor" ou "viewer"
          role:  decoded.role || "viewer",
        }),
      };
    } catch (e) {
      return { statusCode: 401, headers, body: JSON.stringify({ erro: "Token inválido ou expirado" }) };
    }
  }

  // ── DEFINIR ROLE (Custom Claims) ───────────────────────────────────────────
  // Permite definir se um usuário é "supervisor" ou "viewer" diretamente pelo UID.
  // Chame isso uma vez manualmente (ou via painel admin) para configurar cada usuário.
  //
  // Exemplo de uso:
  //   fetch("/.netlify/functions/firebase", {
  //     method: "POST",
  //     body: JSON.stringify({ acao: "definirRole", uid: "UID_DO_USUARIO", role: "supervisor", adminSecret: "SUA_SENHA_ADMIN" })
  //   });
  if (acao === "definirRole") {
    const { uid, role, adminSecret } = body;

    // Protege esse endpoint com uma senha admin separada
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return { statusCode: 403, headers, body: JSON.stringify({ erro: "Não autorizado" }) };
    }

    const rolesPermitidas = ["supervisor", "viewer"];
    if (!rolesPermitidas.includes(role)) {
      return { statusCode: 400, headers, body: JSON.stringify({ erro: "Role inválida" }) };
    }

    try {
      await admin.auth().setCustomUserClaims(uid, { role });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, uid, role }) };
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ erro: "Erro ao definir role" }) };
    }
  }

  return { statusCode: 400, headers, body: JSON.stringify({ erro: "Ação desconhecida" }) };
};
