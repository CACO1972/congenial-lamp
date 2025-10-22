/**
 * Security and Rate Limiting System
 * Nobel Biocare - Enterprise Grade Protection
 */

import { toast } from "sonner";
import { logger } from "./logger";

// Rate limiting configuration
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  identifier: string;
}

class RateLimiter {
  private requests: Map<string, { count: number; resetTime: number }> = new Map();
  
  /**
   * Check if request should be allowed based on rate limits
   */
  public checkLimit(config: RateLimitConfig): boolean {
    const now = Date.now();
    const key = config.identifier;
    const limit = this.requests.get(key);
    
    if (!limit || now > limit.resetTime) {
      // Reset or initialize
      this.requests.set(key, {
        count: 1,
        resetTime: now + config.windowMs
      });
      return true;
    }
    
    if (limit.count >= config.maxRequests) {
      const remainingTime = Math.ceil((limit.resetTime - now) / 1000);
      logger.warn(`Rate limit exceeded for ${key}. Reset in ${remainingTime}s`);
      
      toast.error(
        `Demasiadas solicitudes. Por favor espere ${remainingTime} segundos antes de intentar nuevamente.`,
        { duration: 5000 }
      );
      
      return false;
    }
    
    limit.count++;
    return true;
  }
  
  /**
   * Clear rate limits for a specific identifier
   */
  public clearLimit(identifier: string): void {
    this.requests.delete(identifier);
  }
  
  /**
   * Clear all rate limits
   */
  public clearAll(): void {
    this.requests.clear();
  }
}

// Input validation and sanitization
class InputValidator {
  /**
   * Sanitize HTML to prevent XSS attacks
   */
  public sanitizeHTML(input: string): string {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
  }
  
  /**
   * Validate email format
   */
  public validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  /**
   * Validate phone number format (Chilean)
   */
  public validatePhone(phone: string): boolean {
    const phoneRegex = /^(\+56)?[2-9]\d{8}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  }
  
  /**
   * Validate image file
   */
  public validateImage(file: File): { valid: boolean; error?: string } {
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    
    if (file.size > MAX_SIZE) {
      return { valid: false, error: 'La imagen no debe superar los 10MB' };
    }
    
    if (!ALLOWED_TYPES.includes(file.type)) {
      return { valid: false, error: 'Formato de imagen no soportado. Use JPG, PNG o WebP.' };
    }
    
    return { valid: true };
  }
  
  /**
   * Sanitize user input to prevent injection attacks
   */
  public sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, '') // Remove HTML brackets
      .replace(/javascript:/gi, '') // Remove javascript protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
  }
}

// CSRF Protection
class CSRFProtection {
  private tokens: Map<string, { token: string; expires: number }> = new Map();
  
  /**
   * Generate a CSRF token
   */
  public generateToken(sessionId: string): string {
    const token = this.generateRandomToken();
    const expires = Date.now() + 3600000; // 1 hour
    
    this.tokens.set(sessionId, { token, expires });
    return token;
  }
  
  /**
   * Validate a CSRF token
   */
  public validateToken(sessionId: string, token: string): boolean {
    const stored = this.tokens.get(sessionId);
    
    if (!stored || Date.now() > stored.expires) {
      return false;
    }
    
    return stored.token === token;
  }
  
  /**
   * Generate a cryptographically secure random token
   */
  private generateRandomToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}

// Security Headers Manager
class SecurityHeaders {
  /**
   * Get recommended security headers
   */
  public getHeaders(): Record<string, string> {
    return {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(self), microphone=()',
      'Content-Security-Policy': this.getCSP()
    };
  }
  
  /**
   * Generate Content Security Policy
   */
  private getCSP(): string {
    const policies = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://qdbldrlzabqcuadlkyoy.supabase.co https://ai.gateway.lovable.dev wss:",
      "media-src 'self' blob:",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests"
    ];
    
    return policies.join('; ');
  }
}

// Data Encryption Helper
class DataEncryption {
  /**
   * Encrypt sensitive data before storage
   */
  public async encrypt(data: string, key: CryptoKey): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      dataBuffer
    );
    
    const combined = new Uint8Array(iv.length + encryptedData.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encryptedData), iv.length);
    
    return btoa(String.fromCharCode(...combined));
  }
  
  /**
   * Decrypt data
   */
  public async decrypt(encryptedData: string, key: CryptoKey): Promise<string> {
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  }
  
  /**
   * Generate encryption key
   */
  public async generateKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }
}

// Session Manager
class SessionManager {
  private sessionTimeout = 30 * 60 * 1000; // 30 minutes
  private warningTime = 5 * 60 * 1000; // 5 minutes before timeout
  private sessionTimer: NodeJS.Timeout | null = null;
  private warningTimer: NodeJS.Timeout | null = null;
  
  /**
   * Start session monitoring
   */
  public startSession(): void {
    this.resetTimers();
    this.setupActivityListeners();
  }
  
  /**
   * Reset session timers on activity
   */
  private resetTimers(): void {
    // Clear existing timers
    if (this.sessionTimer) clearTimeout(this.sessionTimer);
    if (this.warningTimer) clearTimeout(this.warningTimer);
    
    // Set warning timer
    this.warningTimer = setTimeout(() => {
      toast.warning(
        "Su sesión expirará en 5 minutos por inactividad. Cualquier acción extenderá su sesión.",
        { duration: 10000 }
      );
    }, this.sessionTimeout - this.warningTime);
    
    // Set session timeout
    this.sessionTimer = setTimeout(() => {
      this.endSession();
    }, this.sessionTimeout);
  }
  
  /**
   * Setup activity listeners
   */
  private setupActivityListeners(): void {
    ['mousedown', 'keypress', 'scroll', 'touchstart'].forEach(event => {
      document.addEventListener(event, () => this.resetTimers(), { passive: true });
    });
  }
  
  /**
   * End session
   */
  private endSession(): void {
    logger.warn("Session expired due to inactivity");
    toast.error("Su sesión ha expirado. Por favor, recargue la página para continuar.", {
      duration: Infinity,
      action: {
        label: "Recargar",
        onClick: () => window.location.reload()
      }
    });
  }
  
  /**
   * Clear all timers
   */
  public clearSession(): void {
    if (this.sessionTimer) clearTimeout(this.sessionTimer);
    if (this.warningTimer) clearTimeout(this.warningTimer);
  }
}

// Audit Logger
class AuditLogger {
  /**
   * Log security events
   */
  public logSecurityEvent(event: {
    type: 'auth' | 'access' | 'modification' | 'error';
    action: string;
    user?: string;
    details?: any;
  }): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...event,
      userAgent: navigator.userAgent,
      url: window.location.href
    };
    
    // In production, send to server
    logger.log('[AUDIT]', logEntry);
    
    // Store locally for debugging
    const logs = JSON.parse(localStorage.getItem('audit_logs') || '[]');
    logs.push(logEntry);
    
    // Keep only last 100 logs
    if (logs.length > 100) {
      logs.shift();
    }
    
    localStorage.setItem('audit_logs', JSON.stringify(logs));
  }
}

// Export singleton instances
export const rateLimiter = new RateLimiter();
export const validator = new InputValidator();
export const csrf = new CSRFProtection();
export const securityHeaders = new SecurityHeaders();
export const encryption = new DataEncryption();
export const sessionManager = new SessionManager();
export const auditLogger = new AuditLogger();

// Security middleware for API calls
export async function secureApiCall(
  url: string,
  options: RequestInit = {},
  config: { requireAuth?: boolean; rateLimit?: RateLimitConfig } = {}
): Promise<Response> {
  // Check rate limits
  if (config.rateLimit) {
    if (!rateLimiter.checkLimit(config.rateLimit)) {
      throw new Error('Rate limit exceeded');
    }
  }
  
  // Add security headers
  const headers = new Headers(options.headers);
  Object.entries(securityHeaders.getHeaders()).forEach(([key, value]) => {
    headers.set(key, value);
  });
  
  // Add CSRF token if required
  if (config.requireAuth) {
    const sessionId = localStorage.getItem('session_id') || 'default';
    const csrfToken = csrf.generateToken(sessionId);
    headers.set('X-CSRF-Token', csrfToken);
  }
  
  // Log the API call for auditing
  auditLogger.logSecurityEvent({
    type: 'access',
    action: `API call to ${url}`,
    details: { method: options.method || 'GET' }
  });
  
  try {
    const response = await fetch(url, { ...options, headers });
    
    if (!response.ok) {
      auditLogger.logSecurityEvent({
        type: 'error',
        action: `API call failed to ${url}`,
        details: { status: response.status }
      });
    }
    
    return response;
  } catch (error) {
    auditLogger.logSecurityEvent({
      type: 'error',
      action: `API call error to ${url}`,
      details: { error: error instanceof Error ? error.message : 'Unknown error' }
    });
    throw error;
  }
}

// Initialize session management on load
if (typeof window !== 'undefined') {
  sessionManager.startSession();
}