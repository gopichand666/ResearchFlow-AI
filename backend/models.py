"""
SQLAlchemy models for User and Article entities.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base


class User(Base):
    """
    User model for authentication and relationship with articles.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    otp = Column(String, nullable=True)
    otp_expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    articles = relationship("Article", back_populates="owner")


class Article(Base):
    """
    Article model for storing research papers and their analysis.
    """
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String, index=True)
    title = Column(String)
    content = Column(Text)  # Markdown content from firecrawl
    summary = Column(Text)  # LLM summary
    insights = Column(Text)  # Key insights extracted by LLM
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    user_id = Column(Integer, ForeignKey("users.id"))

    owner = relationship("User", back_populates="articles")
