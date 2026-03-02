from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pypdf import PdfReader
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

            words = page.extract_words()  # 🔥 key function

            for i, word in enumerate(words):
                text = word["text"].strip()

                if not text:
                    continue

                bbox = normalize_bbox_pdf(
                    word["x0"],
                    word["top"],
                    word["x1"],
                    word["bottom"],
                    page.width,
                    page.height
                )

                parsed_data[page_id]["objects"].append({
                    "id": f"word_{i}",
                    "type": "text",
                    "text": text,
                    "bbox": bbox
                })

    return parsed_data