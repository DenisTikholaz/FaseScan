import sys
import json
import os
import numpy as np
from deepface import DeepFace
import traceback

DB_FILE = "face_db.json"
THRESHOLD = 0.8
def l2_normalize(x):
    return x / np.linalg.norm(x)

def load_db():
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r") as f:
            return json.load(f)
    return {}

def main():
    if len(sys.argv) < 2:
        print("Usage: python identify_face.py <photo_path>")
        sys.exit(1)

    photo_path = sys.argv[1]
    db = load_db()

    if not db:
        print("No face found in DB")
        sys.exit(0)

    try:
        print(f"Running face representation for {photo_path} ...")
        result = DeepFace.represent(photo_path, model_name='Facenet')[0]
        embedding = l2_normalize(np.array(result["embedding"]))
        print("Embedding shape:", embedding.shape)

        min_dist = float('inf')
        identity = "Unknown"

        for google_id, db_embedding in db.items():
            try:
                db_emb = l2_normalize(np.array(db_embedding))
                dist = np.linalg.norm(db_emb - embedding)
                print(f"Distance to {google_id}: {dist:.4f}")
                if dist < min_dist:
                    min_dist = dist
                    identity = google_id
            except Exception as inner_e:
                print(f"Error comparing with {google_id}: {inner_e}")

        if min_dist > THRESHOLD:
            identity = "Unknown"

        print("Identified as:", identity)

    except Exception:
        print("Error during identification:")
        traceback.print_exc()

if __name__ == "__main__":
    main()
