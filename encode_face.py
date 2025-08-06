import sys
import json
import os
import numpy as np
from deepface import DeepFace

DB_FILE = "face_db.json"

def l2_normalize(x):
    return x / np.linalg.norm(x)

def load_db():
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r") as f:
            return json.load(f)
    return {}

def save_db(db):
    with open(DB_FILE, "w") as f:
        json.dump(db, f)

def embedding_to_list(embedding):
    return embedding.tolist() if hasattr(embedding, 'tolist') else embedding

def main():
    if len(sys.argv) < 3:
        print("Usage: python encode_face.py <photo_path> <googleId>")
        sys.exit(1)

    photo_path = sys.argv[1]
    google_id = sys.argv[2]

    try:
        result = DeepFace.represent(photo_path, model_name='Facenet')[0]
        embedding = np.array(result["embedding"])
        normalized_embedding = l2_normalize(embedding)

        db = load_db()
        db[google_id] = embedding_to_list(normalized_embedding)
        save_db(db)

        print("Success")
    except Exception as e:
        print(f"Failed: {str(e)}")

if __name__ == "__main__":
    main()
