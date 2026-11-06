// Loads the Firebase SDK (ES modules) and exposes the functions the app scripts use.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, linkWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, updateDoc, deleteDoc, doc, getDoc, query, orderBy, limit, onSnapshot, getDocs, where, serverTimestamp, increment, documentId } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getDatabase, ref as dbRef, set as dbSet, update as dbUpdate, remove as dbRemove, onValue, onDisconnect, serverTimestamp as rtdbNow } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

Object.assign(globalThis, {
  initializeApp, getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, linkWithCredential, EmailAuthProvider, getFirestore, collection, addDoc, setDoc, updateDoc, deleteDoc, doc, getDoc, query, orderBy, limit, onSnapshot, getDocs, where, serverTimestamp, increment, documentId, getDatabase, dbRef, dbSet, dbUpdate, dbRemove, onValue, onDisconnect, rtdbNow,
});
