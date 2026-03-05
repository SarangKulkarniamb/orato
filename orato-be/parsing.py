from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
import pdfplumber

def normalize_bbox_pdf(x0, top, x1, bottom, page_width, page_height):
    return (
        x0 / page_width,
        top / page_height,
        (x1 - x0) / page_width,
        (bottom - top) / page_height
    )

def clean_text(text):
    if not text:
        return None
    text = text.replace("\x0b", " ").strip()
    return text if text else None

def normalize_bbox_ppt(shape, slide_width, slide_height):
    return (
        shape.left / slide_width,
        shape.top / slide_height,
        shape.width / slide_width,
        shape.height / slide_height
    )

def detect_title(candidates):
    if not candidates:
        return None
    candidates.sort(key=lambda x: (x["top"], -len(x["text"])))
    return candidates[0]["text"]

def parse_ppt(file_path):
    prs = Presentation(file_path)
    parsed_data = {}

    slide_width = prs.slide_width
    slide_height = prs.slide_height

    for slide_idx, slide in enumerate(prs.slides):
        slide_id = slide_idx + 1

        parsed_data[slide_id] = {
            "title": None,
            "objects": []
        }

        title_candidates = []

        for shape_idx, shape in enumerate(slide.shapes):
            obj = {
                "id": f"obj_{shape_idx}",
                "type": None,
                "text": None,
                "bbox": normalize_bbox_ppt(shape, slide_width, slide_height)
            }

            if shape.has_text_frame:
                text = clean_text(shape.text)
                if text:
                    obj["type"] = "text"
                    obj["text"] = text
                    title_candidates.append({
                        "text": text,
                        "top": shape.top
                    })
                else:
                    continue

            elif shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                obj["type"] = "image"
                obj["text"] = "image"

            elif shape.has_table:
                obj["type"] = "table"
                table_text = []
                for row in shape.table.rows:
                    row_text = [clean_text(cell.text) for cell in row.cells if clean_text(cell.text)]
                    if row_text:
                        table_text.append(" | ".join(row_text))
                obj["text"] = "\n".join(table_text) if table_text else None
            else:
                continue

            parsed_data[slide_id]["objects"].append(obj)

        parsed_data[slide_id]["title"] = detect_title(title_candidates)

    return parsed_data

def parse_pdf(file_path):
    parsed_data = {}

    with pdfplumber.open(file_path) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            page_id = page_idx + 1

            parsed_data[page_id] = {
                "title": f"Page {page_id}",
                "objects": []
            }

            words = page.extract_words()
            if not words:
                continue

            # 🔥 FIX: Sort words top-to-bottom, left-to-right
            # We group them roughly by line height to form paragraphs/blocks
            words.sort(key=lambda w: (round(w['top'] / 5), w['x0']))

            blocks = []
            current_block = [words[0]]

            for word in words[1:]:
                prev_word = current_block[-1]
                # If vertical distance from the last word is small (< 15 pts), group them into a block
                if word['top'] - prev_word['top'] < 15:
                    current_block.append(word)
                else:
                    blocks.append(current_block)
                    current_block = [word]
            
            if current_block:
                blocks.append(current_block)

            # 🔥 Create precise bounding boxes for the whole paragraph, not just single words
            for i, block in enumerate(blocks):
                text = " ".join([w["text"].strip() for w in block])
                if len(text) < 3: # Ignore tiny stray fragments
                    continue

                x0 = min(w["x0"] for w in block)
                top = min(w["top"] for w in block)
                x1 = max(w["x1"] for w in block)
                bottom = max(w["bottom"] for w in block)

                bbox = normalize_bbox_pdf(x0, top, x1, bottom, page.width, page.height)

                parsed_data[page_id]["objects"].append({
                    "id": f"block_{i}",
                    "type": "text",
                    "text": text,
                    "bbox": bbox
                })

    return parsed_data