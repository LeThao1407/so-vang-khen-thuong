import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB6gNtMRHgMRavMCmYW6Is35OINOFVazuo",
  authDomain: "so-vang-khen-thuong.firebaseapp.com",
  projectId: "so-vang-khen-thuong",
  storageBucket: "so-vang-khen-thuong.firebasestorage.app",
  messagingSenderId: "591033614050",
  appId: "1:591033614050:web:075c2449c1f5a4b44a68bb"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);