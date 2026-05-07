import os
import json
import logging
from pdf2image import convert_from_path
from doctr.io import DocumentFile
from doctr.models import ocr_predictor
import ollama
from sqlalchemy.orm import Session
from models.db import ExtractedCriteria

# 1. Initialize docTR with a high-sensitivity model
# This model is specifically better for messy scans
predictor = ocr_predictor(det_arch='db_mobilenet_v3_large', reco_arch='crnn_vgg16_bn', pretrained=True)

def process_document_ai(db: Session, file_path: str, doc_hash: str):
    try:
        # Load PDF and convert pages to docTR format
        doc = DocumentFile.from_pdf(file_path)
        
        # Analyze the document (This is where the ML happens)
        result = predictor(doc)
        
        # We need to flatten the results into text for the LLM
        # But keep coordinates for our database
        full_text = ""
        coordinate_map = []

        for page in result.pages:
            for block in page.blocks:
                for line in block.lines:
                    for word in line.words:
                        full_text += f"{word.value} "
                        # Store coordinates: [xmin, ymin, xmax, ymax]
                        coordinate_map.append({
                            "text": word.value,
                            "box": word.geometry, 
                            "confidence": word.confidence
                        })

        # 2. Use Local LLM (Ollama) to find specific data in the messy text
        client = ollama.Client(host="http://ollama:11434")
        
        prompt = f"""
        Analyze this messy OCR text from a government tender. 
        Extract the 'Annual Turnover' and 'Net Worth'.
        Text: {full_text[:3000]} 
        Return ONLY valid JSON: {{"turnover": "value", "net_worth": "value"}}
        """
        
        response = client.chat(model='phi3', messages=[{'role': 'user', 'content': prompt}])
        data = json.loads(response['message']['content'])

        # 3. Save to ExtractedCriteria Table
        # We save the raw JSON result and a snippet for the UI
        new_data = ExtractedCriteria(
            document_hash=doc_hash,
            criterion_id="C-01", # Turnover example
            extracted_value=data.get("turnover", "Not Found"),
            bbox_coordinates=json.dumps(coordinate_map[:10]), # Top matches
            confidence_score=sum([w['confidence'] for w in coordinate_map[:10]]) / 10,
            context_snippet=full_text[:500]
        )
        
        db.add(new_data)
        db.commit()
        
    except Exception as e:
        logging.error(f"Extraction Error: {str(e)}")
        db.rollback()