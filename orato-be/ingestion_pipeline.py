import os
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter

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



def create_vector_db(documents):
    embedding_model = HuggingFaceEmbeddings(
        model_name="all-MiniLM-L6-v2"
    )

    vector_store = Chroma.from_documents(
        documents=documents,
        embedding=embedding_model,
        collection_name="ppt_assistant",
        persist_directory="db/chroma"
    )

    print("✅ Vector DB created successfully")
    return vector_store



if __name__ == "__main__":

    file_path = "demo.pptx"   

    print(f"Processing file: {file_path}")

    parsed_data = load_file(file_path)

    documents = convert_to_documents(parsed_data)
    print(f"Initial documents: {len(documents)}")

    chunked_docs = chunk_documents(documents)
    print(f"After chunking: {len(chunked_docs)}")

    vector_db = create_vector_db(chunked_docs)

    print("Total docs in DB:", vector_db._collection.count())