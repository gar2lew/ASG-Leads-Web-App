import { FieldValue, Timestamp } from "firebase-admin/firestore";

export function firestoreServerTimestamp(): FirebaseFirestore.FieldValue {
  return FieldValue.serverTimestamp();
}

export function firestoreTimestampNow(): FirebaseFirestore.Timestamp {
  return Timestamp.now();
}

export function firestoreTimestampFromDate(date: Date): FirebaseFirestore.Timestamp {
  return Timestamp.fromDate(date);
}
