// ============================================================
// CONFIGURACIÓN DE FIREBASE — SOLO FIRESTORE (sin Auth)
// ============================================================
// INSTRUCCIONES:
// 1. Ve a https://console.firebase.google.com
// 2. Crea un nuevo proyecto
// 3. Ve a Configuración del proyecto > General > Tus apps > (</>)
// 4. Registra una app web y copia la configuración aquí
// 5. Activa Firestore Database (modo prueba está bien para empezar)
// 6. NO necesitas activar Authentication
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyD9mcXCL_0Ung07FWOehRz3j2XrpcFffsQ",
  authDomain: "cochera-pos.firebaseapp.com",
  projectId: "cochera-pos",
  storageBucket: "cochera-pos.firebasestorage.app",
  messagingSenderId: "174097398713",
  appId: "1:174097398713:web:67c5d52aadae08e2331468"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Solo Firestore — sin Auth
const db = firebase.firestore();

// ── Persistencia Offline ──────────────────────────────────────────────────────
// Almacena datos localmente para que el POS siga operando sin internet.
// Firestore sincroniza automáticamente al recuperar la conexión.
// synchronizeTabs: true → comparte el caché entre pestañas del mismo origen.
db.enablePersistence({ synchronizeTabs: true })
  .catch(err => {
    if (err.code === 'failed-precondition') {
      console.warn(
        '[Firestore] Persistencia desactivada: ' +
        'múltiples pestañas abiertas sin soporte de synchronizeTabs.'
      );
    } else if (err.code === 'unimplemented') {
      console.warn('[Firestore] Este navegador no soporta persistencia offline.');
    }
  });

// ============================================================
// REGLAS DE FIRESTORE
// Pegar en: Firebase Console > Firestore Database > Reglas
// ============================================================
//
// NOTA ARQUITECTÓNICA:
// Este sistema usa autenticación propia contra la colección `usuarios` y
// NO usa Firebase Authentication. Por eso `request.auth` siempre es null
// y no se puede usar para validar sesiones a nivel de reglas.
//
// Las reglas actuales son DEFENSIVAS:
//   - Impiden DELETE en todas las colecciones financieras desde cualquier
//     cliente, previniendo borrado accidental o malicioso de registros.
//   - El resto del acceso queda abierto (necesario para operar sin backend).
//
// PARA PRODUCCIÓN REAL: agregar firebase.auth().signInAnonymously() en
// login.html al validar credenciales propias. Eso poblaría request.auth
// y permitiría reglas basadas en `request.auth != null`.
// ============================================================
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── Colecciones financieras: lectura/escritura permitida, DELETE bloqueado ──
    match /autos/{id} {
      allow read, create, update: if true;
      allow delete: if false;
    }

    match /cobros/{id} {
      allow read, create, update: if true;
      allow delete: if false;
    }

    match /turnos/{id} {
      allow read, create, update: if true;
      allow delete: if false;
    }

    // ── Usuarios: sin borrado para prevenir eliminación accidental del admin ──
    match /usuarios/{id} {
      allow read, create, update: if true;
      allow delete: if false;
    }

    // ── Clientes y configuración: acceso completo ──
    match /clientes/{id} {
      allow read, write: if true;
    }

    match /configuracion/{id} {
      allow read, write: if true;
    }
  }
}
*/
