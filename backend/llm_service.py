"""
LLM Service for analyzing and comparing research papers using Groq (primary) and Google Gemini (fallback).
"""
import os
import json
import time
from google import genai
from groq import Groq
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")


class AnalysisResult(BaseModel):
    problem: str
    methodology: str
    results: str
    conclusion: str
    contributions: list[str]
    evolution: str = ""
    research_gaps: str = ""


def call_llm_with_retry(prompt, is_json=False, max_retries=2):
    """
    Calls Groq (primary) or Gemini (fallback) with retry logic.
    """
    # 1. Try Groq first if available
    if GROQ_API_KEY and GROQ_API_KEY != "gsk_your_key_here":
        client = Groq(api_key=GROQ_API_KEY)
        for i in range(max_retries + 1):
            try:
                # Note: Groq supports JSON mode with Llama-3 models
                response_format = {"type": "json_object"} if is_json else None
                res = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": prompt}],
                    response_format=response_format
                )
                content = res.choices[0].message.content
                return content if content else ("{}" if is_json else "")
            except Exception as e:
                err_str = str(e).lower()
                if "429" in err_str or "rate_limit" in err_str or "exhausted" in err_str:
                    wait_time = 5 * (i + 1)
                    print(f"GROQ RATE LIMIT: Waiting {wait_time}s before retry... (Attempt {i+1}/{max_retries})")
                    time.sleep(wait_time)
                    continue
                print(f"Groq technical error, trying fallback: {e}")
                break  # If it's a technical error (not rate limit), break to try Gemini

    # 2. Fallback to Gemini
    if GEMINI_API_KEY:
        client = genai.Client(api_key=GEMINI_API_KEY)
        config = {"response_mime_type": "application/json"} if is_json else None
        
        for i in range(max_retries + 1):
            try:
                res = client.models.generate_content(
                    model="gemini-flash-latest",
                    contents=prompt,
                    config=config
                )
                return res.text if res and res.text else ("{}" if is_json else "")
            except Exception as e:
                err_str = str(e)
                if ("429" in err_str or "RESOURCE_EXHAUSTED" in err_str) and i < max_retries:
                    wait_time = 30
                    print(f"GEMINI RATE LIMIT HIT: Waiting {wait_time}s before retry... (Attempt {i+1}/{max_retries})")
                    time.sleep(wait_time)
                    continue
                
                if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                    raise Exception("All API limits reached. Please wait a few minutes and try again.")
                raise e
    
    raise ValueError("No valid API keys found for Groq or Gemini.")


def analyze_article(content: str, previous_papers: list = None) -> dict:
    """
    Analyze article using LLM and return structured JSON + evolution comparison
    """
    try:
        # Use first 100k characters (plenty for technical analysis)
        summary_content = content[:100000]

        # Prepare evolution context
        evolution_context = ""
        if previous_papers:
            evolution_context = "\n--- Previous Papers for Context ---\n"
            for p in previous_papers:
                evolution_context += f"- Title: {p['title']}\n  Summary: {p['summary'][:500]}...\n"

        # Enhanced Prompt for structured analysis
        prompt = f"""
You are a senior AI research engineer. Analyze the provided research paper content and output a structured analysis in valid JSON format.

Strict Rules:
1. Return ONLY valid JSON. No markdown blocks, no preamble, no postscript.
2. Use ONLY double quotes for all strings and keys.
3. Contributions MUST be a JSON array of short, clear strings.
4. Identify limitations or missing areas for the 'research_gaps' field.
5. Compare with previous research/models and explain trends in the 'evolution' field.

{evolution_context}

JSON Structure:
{{
  "problem": "Brief statement of the core problem",
  "methodology": "How they solved it",
  "results": "What they found",
  "conclusion": "Final takeaway",
  "contributions": ["Short contribution 1", "Short contribution 2"],
  "evolution": "Comparison with similar models, improvements and trends",
  "research_gaps": "Limitations or missing areas in this research"
}}

Paper Content:
{summary_content}
        """

        raw_text = call_llm_with_retry(prompt, is_json=True)
        
        # Enforce JSON Parsing
        try:
            data = json.loads(raw_text)
        except (json.JSONDecodeError, TypeError):
            # Attempt to clean potential markdown wrappers
            if "```json" in raw_text:
                raw_text = raw_text.split("```json")[1].split("```")[0].strip()
            elif "```" in raw_text:
                raw_text = raw_text.split("```")[1].split("```")[0].strip()
            
            try:
                data = json.loads(raw_text)
            except:
                data = {
                    "problem": "Error parsing LLM response",
                    "methodology": "",
                    "results": "",
                    "conclusion": "",
                    "contributions": [],
                    "evolution": "",
                    "research_gaps": ""
                }

        # Ensure all required fields exist
        fallback_keys = {
            "problem": "", "methodology": "", "results": "", "conclusion": "",
            "contributions": [], "evolution": "", "research_gaps": ""
        }
        for key, default in fallback_keys.items():
            if key not in data:
                data[key] = default

        return data

    except Exception as e:
        print("LLM Service Error:", e)
        raise Exception(f"LLM API Error: {str(e)}")


def compare_articles(articles: list) -> str:
    """
    Compare multiple research papers using LLM
    """
    try:
        articles_text = ""
        for idx, art in enumerate(articles):
            snippet = art["content"][:8000]
            articles_text += f"\n--- Paper {idx+1}: {art['title']} ---\n{snippet}\n"

        prompt = f"""
You are an expert research analyst. Compare the given {len(articles)} research papers and provide a deep, structured comparison.

CRITICAL: You MUST use the following exact markers for each section so the system can parse them:
[OVERVIEW]
[METHODOLOGY]
[RESULTS]
[CONTRIBUTIONS]
[EVOLUTION]
[GAPS]
[SUMMARY]

Within each section, explicitly label the analysis for each paper as:
Paper 1: (your analysis)
Paper 2: (your analysis)

Ensure the output is technical and formatted for clear side-by-side reading.

Papers to Compare:
{articles_text}
        """

        comparison_text = call_llm_with_retry(prompt, is_json=False)
        return comparison_text if comparison_text else "No comparison generated."

    except Exception as e:
        print("Comparison Error:", e)
        raise Exception(f"Error generating comparison: {str(e)}")


def chat_about_article(content: str, query: str, history: list = None) -> str:
    """
    Chat about a specific article using LLM
    """
    try:
        context_prompt = f"""
You are ResearchFlow AI, a brilliant and technical research assistant. 

BEHAVIOR GUIDELINES:
1. Respond politely to greetings and invite research questions.
2. Provide deep technical insights based on the content below.
3. If unsure, state you're based on the provided text.

Research Paper Content:
{content[:20000]}

User Question: {query}
"""
        response_text = call_llm_with_retry(context_prompt, is_json=False)
        return response_text if response_text else "I couldn't generate a response."

    except Exception as e:
        print("Chat Error:", e)
        raise Exception(f"Error in chat: {str(e)}")


# ---------------- TEST ---------------- #

if __name__ == "__main__":
    sample_text = "Artificial Intelligence is transforming industries by enabling automation."
    result = analyze_article(sample_text)
    print("\nJSON RESULT:\n", json.dumps(result, indent=2))
