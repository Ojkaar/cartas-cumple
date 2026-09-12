// Configuración de Firebase para el Cumpleaños de Jenni
const firebaseConfig = {
  apiKey: "AIzaSyBGuqUJaSCx4vO_NwQfL2K2pv81uPWaGvk",
  authDomain: "cumple-jenni.firebaseapp.com",
  databaseURL: "https://cumple-jenni-default-rtdb.firebaseio.com",
  projectId: "cumple-jenni",
  storageBucket: "cumple-jenni.firebasestorage.app",
  messagingSenderId: "855670454358",
  appId: "1:855670454358:web:f04d6f99e79cf99f3fa3f7",
  measurementId: "G-7FMKDTGY3Z"
};

// Inicializar Firebase Compat
if (typeof firebase !== 'undefined' && firebase.initializeApp) {
  firebase.initializeApp(firebaseConfig);
}
