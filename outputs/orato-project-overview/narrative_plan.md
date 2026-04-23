Audience: project reviewers, mentors, teammates, and demo listeners who need a fast but credible understanding of what Orato does and how it is built.

Objective: explain the full project end to end, from user problem to product flow to technical architecture, while staying grounded in the actual implementation in this repository.

Narrative arc:
1. Introduce Orato as a voice-first presentation assistant for PDF-based lectures and demos.
2. Show the user journey from upload to live presentation to enrichment.
3. Break down the architecture across frontend, backend, storage, and AI services.
4. Explain the real-time voice loop and the document intelligence pipeline.
5. Close with strengths, current gaps, and next-step opportunities.

Slide list:
1. Title and project framing.
2. Problem, audience, and value proposition.
3. End-to-end product workflow.
4. System architecture.
5. Real-time voice control loop.
6. Document intelligence and enrichment features.
7. Tech stack and API surface.
8. Strengths, risks, and next steps.

Source plan:
- Frontend UX and routes: D:\personal\projects\isa\orato-fe\src\app\App.tsx
- Landing and value proposition: D:\personal\projects\isa\orato-fe\src\app\pages\Landing.tsx
- Library upload/presentation flow: D:\personal\projects\isa\orato-fe\src\app\pages\Library.tsx
- Presentation runtime and search mode: D:\personal\projects\isa\orato-fe\src\app\pages\Presentation.tsx
- Auth state: D:\personal\projects\isa\orato-fe\src\app\store\authStore.ts
- FastAPI entry and routes: D:\personal\projects\isa\orato-be\main.py, D:\personal\projects\isa\orato-be\http_routes.py
- WebSocket STT and action dispatch: D:\personal\projects\isa\orato-be\websocket_routes.py
- Retrieval and command reasoning: D:\personal\projects\isa\orato-be\retreival_pipeline.py, D:\personal\projects\isa\orato-be\llm_reasoner.py
- Parsing and ingestion: D:\personal\projects\isa\orato-be\parsing.py, D:\personal\projects\isa\orato-be\ingestion_pipeline.py
- Auth and database access: D:\personal\projects\isa\orato-be\auth.py, D:\personal\projects\isa\orato-be\database.py

Visual system:
- Dark, technical presentation style inspired by the product UI.
- Indigo and cyan accents to reflect the Orato interface.
- Rounded panels, signal lines, chips, and flow arrows to make the architecture readable.
- Minimal decorative geometry instead of stock illustrations so the deck stays fully editable and repo-specific.

Asset needs:
- No external art is required for this deck.
- Visual emphasis will come from native PowerPoint shapes, labels, and diagram blocks.

Editability plan:
- All visible slide text will be editable PowerPoint text boxes.
- Architecture diagrams, chips, cards, and flow arrows will be native shapes.
- Speaker notes will capture source references for each slide.
