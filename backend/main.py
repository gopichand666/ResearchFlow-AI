"""
Main API entry point for ResearchFlow AI.
"""
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import random
from datetime import datetime, timedelta, timezone
import json
from pydantic import BaseModel

from . import models, database
from .firecrawl_service import scrape_url
from .llm_service import analyze_article, compare_articles
from .email_service import send_otp_email

models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="Research Aggregator API")

# Setup CORS to allow frontend to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    email: str


class VerifyOtpRequest(BaseModel):
    email: str
    otp: str


class AnalyzeRequest(BaseModel):
    url: str
    force_analyze: bool = False


class CompareRequest(BaseModel):
    article_ids: List[int]


class ChatRequest(BaseModel):
    article_id: int
    query: str


class StatsResponse(BaseModel):
    total_papers: int
    recent_title: str = "None"
    total_words: int = 0


class ArticleResponse(BaseModel):
    id: int
    url: str
    title: str
    summary: str  # Storing JSON string or formatted text
    insights: str # Storing Evolution/Insights
    # Optional: specialized fields if we want to parse them on return
    problem: str = ""
    methodology: str = ""
    results: str = ""
    conclusion: str = ""
    contributions: str = ""
    research_gaps: str = ""
    created_at: datetime = None

    class Config:
        from_attributes = True


def get_current_user(x_user_email: str = Header(None), db: Session = Depends(database.get_db)):
    """
    Dependency to retrieve current user based on email header.
    """
    if not x_user_email:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.query(models.User).filter(
        models.User.email == x_user_email).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@app.post("/api/auth/login")
def login(request: LoginRequest, db: Session = Depends(database.get_db)):
    email = request.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        user = models.User(email=email)
        db.add(user)
        db.commit()
        db.refresh(user)

    # Generate 6-digit OTP
    otp = str(random.randint(100000, 999999))
    user.otp = otp
    user.otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.commit()

    # Send actual email
    try:
        print(f"Attempting to send OTP email to: {user.email}")
        send_otp_email(user.email, otp)
        print(f"Successfully sent OTP email to: {user.email}")
    except Exception as e:
        # If email fails, clear the OTP so we don't leave an invalid state
        user.otp = None
        user.otp_expires_at = None
        db.commit()
        print(f"Failed to send email to {user.email}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to send email: {str(e)}")

    return {"message": "OTP sent to email"}


@app.post("/api/auth/verify-otp")
def verify_otp(request: VerifyOtpRequest, db: Session = Depends(database.get_db)):
    email = request.email.strip().lower()
    user = db.query(models.User).filter(models.User.email == email).first()

    if not user or user.otp != request.otp:
        raise HTTPException(status_code=401, detail="Invalid OTP")

    if user.otp_expires_at:
        now = datetime.now(timezone.utc)
        if user.otp_expires_at.tzinfo is None:
            now = now.replace(tzinfo=None)

        if user.otp_expires_at < now:
            raise HTTPException(status_code=401, detail="OTP has expired")

    # Clear OTP
    user.otp = None
    user.otp_expires_at = None
    db.commit()

    return {"message": "Login successful", "email": user.email}


@app.post("/api/analyze", response_model=ArticleResponse)
def analyze_and_store(
    request: AnalyzeRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    url = request.url.strip()
    
    # Task 6: Basic Error Handling
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")
    
    # Simple URL validation
    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid URL format")

    # 1. Check if we already have it in our Memento DB for this user
    existing_article = (
        db.query(models.Article)
        .filter(models.Article.url == url, models.Article.user_id == current_user.id)
        .first()
    )
    if existing_article and not request.force_analyze:
        raise HTTPException(
            status_code=409, 
            detail="This paper already exists in your dashboard. Analyze again?"
        )

    # 2. Scrape with Firecrawl
    try:
        scrape_data = scrape_url(url)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Firecrawl error: {str(e)}")

    # Task 3: Simple Duplicate Check (Title or Keywords)
    title = scrape_data.get("title", "").strip()
    if title:
        duplicate = db.query(models.Article).filter(
            models.Article.title == title, 
            models.Article.user_id == current_user.id
        ).first()
        if duplicate:
            raise HTTPException(status_code=400, detail="This paper may already exist in your dashboard (matched by title)")

    # Task 2: Fetch last 2-3 stored papers from SQLite
    previous_papers = (
        db.query(models.Article)
        .filter(models.Article.user_id == current_user.id)
        .order_by(models.Article.created_at.desc())
        .limit(3)
        .all()
    )
    prev_data = [{"title": p.title, "summary": p.summary} for p in previous_papers]

    # 3. Analyze with LLM
    try:
        analysis_data = analyze_article(scrape_data["content"], previous_papers=prev_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {str(e)}")

    # Prepare storage format
    # We'll store the main summary/JSON in 'summary' and evolution in 'insights'
    summary_json = json.dumps(analysis_data)
    evolution_text = analysis_data.get("evolution", "No evolution context provided.")

    # 4. Store in Memento DB
    new_article = models.Article(
        url=url,
        title=title,
        content=scrape_data["content"],
        summary=summary_json,
        insights=evolution_text,
        user_id=current_user.id
    )
    db.add(new_article)
    db.commit()
    db.refresh(new_article)

    # Map to response model
    return ArticleResponse(
        id=new_article.id,
        url=new_article.url,
        title=new_article.title,
        summary=new_article.summary,
        insights=new_article.insights,
        problem=analysis_data.get("problem", ""),
        methodology=analysis_data.get("methodology", ""),
        results=analysis_data.get("results", ""),
        conclusion=analysis_data.get("conclusion", ""),
        contributions=", ".join(analysis_data.get("contributions", [])) if isinstance(analysis_data.get("contributions"), list) else str(analysis_data.get("contributions", "")),
        research_gaps=analysis_data.get("research_gaps", ""),
        created_at=new_article.created_at
    )


@app.get("/api/mementos", response_model=List[ArticleResponse])
def get_mementos(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    articles = (
        db.query(models.Article)
        .filter(models.Article.user_id == current_user.id)
        .order_by(models.Article.created_at.desc())
        .all()
    )
    
    responses = []
    for a in articles:
        raw_text = a.summary
        try:
            data = json.loads(raw_text)
        except json.JSONDecodeError:
            # Fallback if JSON is wrapped in code blocks
            if "```json" in raw_text:
                clean = raw_text.split("```json")[1].split("```")[0].strip()
                data = json.loads(clean)
            else:
                data = {"problem": raw_text}
            
        responses.append(ArticleResponse(
            id=a.id,
            url=a.url,
            title=a.title,
            summary=a.summary,
            insights=a.insights,
            problem=data.get("problem", ""),
            methodology=data.get("methodology", ""),
            results=data.get("results", ""),
            conclusion=data.get("conclusion", ""),
            contributions=", ".join(data.get("contributions", [])) if isinstance(data.get("contributions"), list) else str(data.get("contributions", "")),
            research_gaps=data.get("research_gaps", ""),
            created_at=a.created_at
        ))
    return responses


@app.post("/api/compare")
def compare_mementos(
    request: CompareRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    print(f"DEBUG: Comparing articles for user {current_user.email}: {request.article_ids}")
    
    if not request.article_ids or len(request.article_ids) < 2:
        return {"success": False, "error": "Please select at least 2 papers to compare."}

    # Fetch all requested articles for this user
    articles = (
        db.query(models.Article)
        .filter(models.Article.id.in_(request.article_ids), models.Article.user_id == current_user.id)
        .all()
    )

    if not articles or len(articles) == 0:
        return {"success": False, "error": "Selected papers not found in your library."}

    if len(articles) < len(request.article_ids):
        print(f"WARNING: Some papers were not found. Requested: {len(request.article_ids)}, Found: {len(articles)}")

    # Prepare data for LLM
    articles_data = [{"title": a.title, "content": a.content} for a in articles]
    print(f"DEBUG: Sending {len(articles_data)} papers to LLM for comparison.")

    try:
        from .llm_service import compare_articles
        comparison_text = compare_articles(articles_data)
        
        if not comparison_text or comparison_text.strip() == "":
            return {"success": False, "error": "LLM returned an empty comparison."}
            
        print("DEBUG: Comparison successful.")
        return {"success": True, "comparison": comparison_text}
    except Exception as e:
        print(f"ERROR in Comparison API: {str(e)}")
        return {"success": False, "error": f"LLM comparison failed: {str(e)}"}


@app.post("/api/chat")
def chat(
    request: ChatRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    article = db.query(models.Article).filter(
        models.Article.id == request.article_id,
        models.Article.user_id == current_user.id
    ).first()

    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    try:
        from .llm_service import chat_about_article
        response = chat_about_article(article.content, request.query)
        return {"response": response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/mementos/{article_id}")
def delete_memento(
    article_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    article = db.query(models.Article).filter(
        models.Article.id == article_id,
        models.Article.user_id == current_user.id
    ).first()

    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    db.delete(article)
    db.commit()
    return {"message": "Deleted successfully"}


@app.get("/api/stats", response_model=StatsResponse)
def get_stats(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user)
):
    articles = db.query(models.Article).filter(models.Article.user_id == current_user.id).all()
    
    total = len(articles)
    recent = articles[0].title if total > 0 else "None"
    words = sum(len(a.content.split()) for a in articles)
    
    return StatsResponse(
        total_papers=total,
        recent_title=recent,
        total_words=words
    )


# Mount the frontend directory to serve the static HTML/CSS/JS files
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
