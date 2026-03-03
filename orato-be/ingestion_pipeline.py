import os
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Assumes your parsing.py (provided earlier) is in the same directory
from parsing import parse_ppt, parse_pdf

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
                content = f"{title} diagram"
                doc = Document(
                    page_content=content,
                    metadata={
                        "slide": int(slide_id),
                        "title": str(title),
                        "section": "image",
                        "bbox": list(obj["bbox"]),
                        "type": "image"
                    }
                )
                documents.append(doc)

    return documents

def chunk_documents(documents):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=300,
        chunk_overlap=50
    )
    chunked_docs = []
    for doc in documents:
        splits = splitter.split_text(doc.page_content)
        for chunk in splits:
            new_doc = Document(
                page_content=chunk,
                metadata=doc.metadata   
            )
            chunked_docs.append(new_doc)
    return chunked_docs

def create_vector_db(documents, doc_id):
    """Creates a unique vector DB in an isolated folder for the specific document."""
    embedding_model = HuggingFaceEmbeddings(
        model_name="all-MiniLM-L6-v2"
    )

    vector_store = Chroma.from_documents(
        documents=documents,
        embedding=embedding_model,
        collection_name=f"doc_{doc_id}",
        persist_directory=f"db/chroma/{doc_id}" 
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
        
        create_vector_db(chunked_docs, doc_id)
        print(f"🎉 Finished ingestion for doc: {doc_id}")
    except Exception as e:
        print(f"❌ Error ingesting document {doc_id}: {e}")