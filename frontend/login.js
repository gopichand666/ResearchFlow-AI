const API_BASE_URL = 'http://localhost:8000/api';

let currentEmail = '';

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('emailInput').value.trim();
    const loginBtn = document.getElementById('loginBtn');
    const errorDiv = document.getElementById('loginError');
    
    if (!email) return;
    
    loginBtn.disabled = true;
    loginBtn.textContent = 'Sending...';
    errorDiv.classList.add('hidden');
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        
        if (!response.ok) {
            throw new Error('Failed to send code. Please try again.');
        }
        
        currentEmail = email;
        
        // Hide login form, show OTP form
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('otpForm').classList.remove('hidden');
        document.getElementById('otpInput').focus();
        
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Send Code';
    }
});

document.getElementById('otpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const otp = document.getElementById('otpInput').value.trim();
    const verifyBtn = document.getElementById('verifyBtn');
    const errorDiv = document.getElementById('loginError');
    
    if (!otp) return;
    
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Verifying...';
    errorDiv.classList.add('hidden');
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: currentEmail, otp: otp })
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || 'Invalid OTP.');
        }
        
        const data = await response.json();
        
        // Save the email/token to localStorage
        localStorage.setItem('userEmail', data.email);
        
        // Redirect to dashboard
        window.location.href = 'index.html';
        
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify OTP';
    }
});

// Typing Animation
function initTypewriter(id, words) {
    const el = document.getElementById(id);
    if (!el) return;
    let wordIdx = 0;
    let charIdx = 0;
    let isDeleting = false;

    function type() {
        const currentWord = words[wordIdx];
        if (isDeleting) {
            el.textContent = currentWord.substring(0, charIdx - 1);
            charIdx--;
        } else {
            el.textContent = currentWord.substring(0, charIdx + 1);
            charIdx++;
        }

        let typeSpeed = isDeleting ? 50 : 100;

        if (!isDeleting && charIdx === currentWord.length) {
            isDeleting = true;
            typeSpeed = 2000; // Pause at end
        } else if (isDeleting && charIdx === 0) {
            isDeleting = false;
            wordIdx = (wordIdx + 1) % words.length;
            typeSpeed = 500;
        }

        setTimeout(type, typeSpeed);
    }
    type();
}

document.addEventListener('DOMContentLoaded', () => {
    initTypewriter('loginTyping', ["Analyze. Compare. Evolve.", "Your AI Memento System.", "Secure Academic Access."]);
});
