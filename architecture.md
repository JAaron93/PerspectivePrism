# System Architecture

## High-Level Architecture

```mermaid
graph TD
    User[User] -->|Interacts with| Client[Frontend (React 19 / Vite)]
    User -->|Views YouTube| ExtUI["Chrome Extension Side Panel (sidepanel.html)"]
    
    subgraph Chrome Extension (MV3)
        ExtUI -->|Message Channel| SW[Service Worker (background.js)]
        SW <-->|Content Hash Cache| Storage[chrome.storage.local]
    end

    Client -->|HTTP/JSON| API[Backend API (FastAPI)]
    SW -->|HTTPS / Job Polling| API
    
    subgraph Backend Pipeline
        API -->|Stage 1: Pre-Classification| PC[Content Classifier Service]
        API -->|Stage 2: Claim Extraction| CE[Claim Extractor]
        API -->|Stage 3: Evidence Retrieval| ER[Evidence Retriever]
        API -->|Stage 4: Perspective & Bias| AS[Analysis Service]
        API -->|Stage 5: Epistemic Lens| AL[Alethiology Service]
    end
    
    subgraph External Services & Foundation Models
        PC -->|Fast Regex & Prompt| Vertex[GCP Vertex AI Gemini 3.x]
        CE -->|Fetches| YT[YouTube Transcript API]
        CE -->|Structured Extraction| Vertex
        ER -->|Multi-Perspective Queries| GCS[Google Custom Search API]
        AS -->|Stance & Deception Analysis| Vertex
        AL -->|Epistemic Truth Theories| Vertex
    end
    
    style User fill:#f9f,stroke:#333,stroke-width:2px
    style Client fill:#bbf,stroke:#333,stroke-width:2px
    style ExtUI fill:#bbf,stroke:#333,stroke-width:2px
    style SW fill:#dfd,stroke:#333,stroke-width:1px
    style Storage fill:#ffd,stroke:#333,stroke-width:1px
    style API fill:#bfb,stroke:#333,stroke-width:2px
    style PC fill:#ffe,stroke:#333,stroke-width:1px
    style CE fill:#dfd,stroke:#333,stroke-width:1px
    style ER fill:#dfd,stroke:#333,stroke-width:1px
    style AS fill:#dfd,stroke:#333,stroke-width:1px
    style AL fill:#eef,stroke:#333,stroke-width:1px
```

---

## Analysis Flow & Pipeline Stages

```mermaid
sequenceDiagram
    actor User
    participant Client as Client (Side Panel / SPA)
    participant BE as Backend API
    participant PC as Pre-Classifier Service
    participant CE as Claim Extractor
    participant ER as Evidence Retriever
    participant AS as Analysis Service
    participant AL as Alethiology Service
    participant EXT as External APIs (Search / Vertex AI)

    User->>Client: Submit YouTube URL (or click "Analyze Anyway")
    Client->>BE: POST /analyze/jobs { url, force_override, metadata }
    activate BE
    
    Note over BE,PC: Stage 1: Pre-Classification Guardrail Gate
    alt force_override is true
        BE->>BE: Skip classification (force_override=True)
    else force_override is false
        BE->>PC: classify_video(video_id, title, snippet)
        PC->>PC: Check deterministic regex fast-path (<1ms)
        alt Inconclusive
            PC->>EXT: Gemini ADK Classifier Agent
            EXT-->>PC: ContentEligibilityResult
        end
        PC-->>BE: ContentEligibilityResult
        
        opt is_analysable is false
            BE-->>Client: Early Return { status: "complete", eligibility: { is_analysable: false, ... } }
            Note over Client: Displays Ineligible Disclaimer & [⚡ Analyze Anyway]
        end
    end

    Note over BE,CE: Stage 2: Claim Extraction
    BE->>CE: extract_claims(video_id)
    CE->>EXT: YouTube Transcript API
    EXT-->>CE: Raw Transcript
    CE->>EXT: Gemini ADK ExtractorAgent (Structured Outputs)
    EXT-->>CE: Extracted Claims List
    CE-->>BE: List of Claims

    Note over BE,AL: Stage 3, 4 & 5: Multi-Perspective, Bias, & Epistemic Analysis
    loop For each claim
        par Evidence Retrieval
            BE->>ER: retrieve_evidence(claim)
            ER->>EXT: Google Custom Search (Scientific, Journalistic, Partisan)
            EXT-->>ER: Search Snippets & Sources
            ER-->>BE: Evidence Dict
        and Perspective Analysis
            BE->>AS: analyze_perspective(claim, evidence)
            AS->>EXT: Gemini ADK Perspective Agent
            EXT-->>AS: Perspective Analysis Results
            AS-->>BE: Perspective Ratings
        and Alethiology (Epistemic Lens)
            BE->>AL: analyze_alethiology(claim, transcript_context)
            AL->>EXT: Gemini ADK Alethiology Agent
            EXT-->>AL: AlethiologyAnalysis (Theories, Summary, Quotes)
            AL-->>BE: Epistemic Lens Analysis
        end
        
        BE->>AS: analyze_bias_and_deception(claim)
        AS->>EXT: Gemini ADK Bias Agent
        EXT-->>AS: Bias & Deception Ratings
        AS-->>BE: Bias Results
        
        BE->>BE: Assemble Truth Profile (Perspectives + Bias + Alethiology)
    end
    
    BE-->>Client: AnalysisResponse (Truth Profiles + Eligibility)
    deactivate BE
    
    Client->>User: Render Epistemic Lens Cards & Claim Stances
```

---

## Data Schemas & API Contracts

### 1. Job Submission (`POST /analyze/jobs`)
```json
{
  "url": "https://www.youtube.com/watch?v=abcdefghijk",
  "force_override": false,
  "metadata": {
    "title": "Video Title",
    "description": "Video Description"
  }
}
```

### 2. Content Eligibility Schema (`ContentEligibilityResult`)
```json
{
  "is_analysable": false,
  "confidence_score": 0.95,
  "detected_category": "Music",
  "disclaimer_title": "Content Not Analysable",
  "disclaimer_message": "This video appears to be musical or entertainment content lacking factual empirical claims.",
  "justification": "Identified official music video markers and lyrical structures."
}
```

### 3. Alethiology Schema (`AlethiologyAnalysis`)
```json
{
  "primary_theory": "correspondence",
  "secondary_theory": "coherence",
  "epistemic_summary": "The claim relies primarily on empirical observation and sensor measurement, supported by structural consistency with thermodynamic models.",
  "quotes": [
    "Measurements recorded by the orbital probe confirmed a 1.2% variance."
  ],
  "confidence_score": 0.88
}
```

### 4. Client Integration Models
* **Chrome Extension Side Panel**:
  * `#state-ineligible`: Displays category chip, confidence gauge, explanatory disclaimer text, and accessible `[⚡ Analyze Anyway]` button.
  * `.pp-epistemic-lens-card`: Displays primary/secondary theory badges, an epistemic synthesis paragraph, and an expandable evidence drawer (`.pp-quote-drawer`).
* **React Frontend SPA**:
  * `EligibilityDisclaimer.tsx`: Renders the guardrail warning with force-override triggering.
  * `EpistemicLensCard.tsx`: Renders the philosophical truth theory breakdown.
