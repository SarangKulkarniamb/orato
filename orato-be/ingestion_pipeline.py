import os
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Assumes your parsing.py is in the same directory
from parsing import parse_ppt, parse_pdf
from settings import get_chroma_path


def _get_embedding_model():
    from langchain_huggingface import HuggingFaceEmbeddings

    return HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")


def _get_chroma_class():
    from langchain_chroma import Chroma

    return Chroma

def load_file(file_path):
    if file_path.endswith(".pptx"):
        return parse_ppt(file_path)
    elif file_path.endswith(".pdf"):
        return parse_pdf(file_path)
    else:
        raise ValueError("Unsupported file format")

def detect_section(text, title):
    text_lower = (text or "").lower()
    title_lower = (title or "").lower()

    if "problem" in text_lower or "problem" in title_lower:
        return "problem"
    elif "solution" in text_lower:
        return "solution"
    elif "implement" in text_lower:
        return "implementation"
    elif "result" in text_lower:
        return "result"
    elif "advantage" in text_lower:
        return "advantage"
    elif "step" in text_lower:
        return "steps"
    else:
        return "general"

def convert_to_documents(parsed_data):
    documents = []
    for slide_id, slide in parsed_data.items():
        title = slide["title"] or f"Slide {slide_id}"

        for obj in slide["objects"]:
            if obj["type"] == "text" and obj["text"]:
                content = f"{title}\n{obj['text']}"
                doc = Document(
                    page_content=content,
                    metadata={
                        "slide": int(slide_id),
                        "title": str(title),
                        "section": detect_section(obj["text"], title),
                        "bbox": list(obj["bbox"]),   
                        "type": "text"
                    }
                )
                documents.append(doc)

            elif obj["type"] == "image":
                # Ensure the AI-generated caption or slide context is actually searchable text
                content = f"{title}\n{obj['text']}"
                doc = Document(
                    page_content=content,
                    metadata={
                        "slide": int(slide_id),
                        "title": str(title),
                        "section": "image",
                        "bbox": list(obj["bbox"]),
                        "type": "image",
                        # Pass the image index so the frontend modal knows what to open
                        "image_ind": obj.get("image_ind", 0)
                    }
                )
                documents.append(doc)

    return documents


def chunk_documents(documents):
    """Chunks text while injecting the slide title into split orphans for semantic retention."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=350, # Slightly larger to fit full context
        chunk_overlap=50
    )
    chunked_docs = []
    
    for doc in documents:
        # 1. If text is short, keep it whole (preserves the exact bounding box logic better)
        if len(doc.page_content) <= 350:
            chunked_docs.append(doc)
            continue
            
        # 2. If it's too long, split it, but explicitly keep the semantic context
        splits = splitter.split_text(doc.page_content)
        title = doc.metadata.get("title", "")
        
        for i, chunk in enumerate(splits):
            # Re-inject the title into the chunk if it got split away
            if i > 0 and title and title not in chunk:
                chunk_with_context = f"Slide Topic - {title}:\n{chunk}"
            else:
                chunk_with_context = chunk
                
            new_doc = Document(
                page_content=chunk_with_context,
                metadata=doc.metadata   
            )
            chunked_docs.append(new_doc)
            
    return chunked_docs


def create_vector_db(documents, doc_id):
    """Creates a unique vector DB in an isolated folder for the specific document."""
    embedding_model = _get_embedding_model()

    vector_store = _get_chroma_class().from_documents(
        documents=documents,
        embedding=embedding_model,
        collection_name=f"doc_{doc_id}",
        persist_directory=get_chroma_path(doc_id)
    )

    print(f"✅ Vector DB created successfully for Doc ID: {doc_id}")
    return vector_store

def process_document_pipeline(file_path: str, doc_id: str):
    """Entry point for FastAPI Background Tasks."""
    try:
        print(f"⚙️ Starting ingestion for: {file_path}")
        parsed_data = load_file(file_path)
        
        documents = convert_to_documents(parsed_data)
        print(f"📄 Initial documents extracted: {len(documents)}")
        
        chunked_docs = chunk_documents(documents)
        print(f"✂️ Documents after chunking: {len(chunked_docs)}")
        
        if not chunked_docs:
            print(f"⚠️ Warning: No extractable text or images found in {file_path}. Skipping Vector DB creation.")
            return

        create_vector_db(chunked_docs, doc_id)
        print(f"🎉 Finished ingestion for doc: {doc_id}")
    except Exception as e:
        print(f"❌ Error ingesting document {doc_id}: {e}")
