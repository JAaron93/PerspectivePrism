# System Architecture

## High-Level Architecture

```mermaid
graph TD
    User[User] -->|Interacts with| Client[Frontend (React/Vite)]
    Client -->|HTTP/JSON| API[Backend API (FastAPI)]
    
    subgraph Backend Services
        API -->|Uses| CE[Claim Extractor]
        API -->|Uses| ER[Evidence Retriever]
        API -->|Uses| AS[Analysis Service]
    end
    
    subgraph External APIs
        CE -->|Fetches| YT[YouTube Transcript API]
        ER -->|Queries| GCS[Google Custom Search API]
        AS -->|Prompts| LLM[Gemini API]
    end
    
    style User fill:#f9f,stroke:#333,stroke-width:2px
    style Client fill:#bbf,stroke:#333,stroke-width:2px
    style API fill:#bfb,stroke:#333,stroke-width:2px
    style CE fill:#dfd,stroke:#333,stroke-width:1px
    style ER fill:#dfd,stroke:#333,stroke-width:1px
    style AS fill:#dfd,stroke:#333,stroke-width:1px
```

## Analysis Flow

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant BE as Backend API
    participant CE as Claim Extractor
    participant ER as Evidence Retriever
    participant AS as Analysis Service
    participant EXT as External APIs (Google Search/Gemini)

    User->>FE: Enter YouTube URL & Click Analyze
    FE->>BE: POST /analyze {url}
    activate BE
    
    Note over BE: 1. Extraction Phase
    BE->>CE: extract_video_id(url)
    CE-->>BE: video_id
    BE->>CE: get_transcript(video_id)
    CE->>EXT: Fetch Transcript
    EXT-->>CE: transcript
    CE-->>BE: transcript
    
    BE->>CE: extract_claims(transcript)
    CE->>EXT: LLM Extract Claims
    EXT-->>CE: claims_list
    CE-->>BE: claims
    
    Note over BE: 2. Analysis Phase (Per Claim)
    loop For each claim
        par Retrieve Evidence
            BE->>ER: retrieve_evidence(claim, perspectives)
            ER->>EXT: Google Search (Scientific, Journalistic, etc.)
            EXT-->>ER: search_results
            ER-->>BE: evidence_dict
        and Analyze Perspectives
            BE->>AS: analyze_perspective(claim, evidence)
            AS->>EXT: LLM Analyze Stance & Confidence
            EXT-->>AS: perspective_analysis
            AS-->>BE: perspective_result
        end
        
        BE->>AS: analyze_bias_and_deception(claim)
        AS->>EXT: LLM Analyze Bias
        EXT-->>AS: bias_analysis
        AS-->>BE: bias_result
        
        BE->>BE: Construct Truth Profile
    end
    
    BE-->>FE: AnalysisResponse (Truth Profiles)
    deactivate BE
    
    FE->>User: Display Results
```
