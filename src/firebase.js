import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCXGrtubXCy92iBuWrxQQbEXp9H_WvUirU",
  authDomain: "mafia-26e5b.firebaseapp.com",
  projectId: "mafia-26e5b",
  storageBucket: "mafia-26e5b.firebasestorage.app",
  messagingSenderId: "186664297207",
  appId: "1:186664297207:web:05c0dee5c3a8f996cf29f2",
  measurementId: "G-S4W74TMKGC"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };