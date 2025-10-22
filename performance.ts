/**
 * Performance Optimization and Caching System
 * Nobel Biocare - Enterprise Performance Standards
 */

import { logger } from "./logger";

// Cache configuration
interface CacheConfig {
  maxSize: number; // Maximum cache size in bytes
  maxAge: number; // Maximum age in milliseconds
  strategy: 'LRU' | 'LFU' | 'FIFO'; // Cache replacement strategy
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  size: number;
  frequency: number;
  lastAccessed: number;
}

/**
 * Advanced caching system with multiple strategies
 */
class CacheManager<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private totalSize = 0;
  private config: CacheConfig;
  
  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: 50 * 1024 * 1024, // 50MB default
      maxAge: 30 * 60 * 1000, // 30 minutes default
      strategy: 'LRU',
      ...config
    };
  }
  
  /**
   * Get item from cache
   */
  public get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.config.maxAge) {
      this.delete(key);
      return null;
    }
    
    // Update access metadata
    entry.lastAccessed = Date.now();
    entry.frequency++;
    
    return entry.data;
  }
  
  /**
   * Set item in cache
   */
  public set(key: string, data: T, size?: number): void {
    const dataSize = size || this.estimateSize(data);
    
    // Check if item fits in cache
    if (dataSize > this.config.maxSize) {
      logger.warn(`Item too large for cache: ${key} (${dataSize} bytes)`);
      return;
    }
    
    // Make space if needed
    while (this.totalSize + dataSize > this.config.maxSize) {
      this.evict();
    }
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      size: dataSize,
      frequency: 0,
      lastAccessed: Date.now()
    };
    
    // Remove old entry if exists
    if (this.cache.has(key)) {
      this.delete(key);
    }
    
    this.cache.set(key, entry);
    this.totalSize += dataSize;
  }
  
  /**
   * Delete item from cache
   */
  public delete(key: string): boolean {
    const entry = this.cache.get(key);
    
    if (entry) {
      this.totalSize -= entry.size;
      return this.cache.delete(key);
    }
    
    return false;
  }
  
  /**
   * Clear all cache
   */
  public clear(): void {
    this.cache.clear();
    this.totalSize = 0;
  }
  
  /**
   * Evict items based on strategy
   */
  private evict(): void {
    let keyToEvict: string | null = null;
    
    switch (this.config.strategy) {
      case 'LRU':
        keyToEvict = this.getLRUKey();
        break;
      case 'LFU':
        keyToEvict = this.getLFUKey();
        break;
      case 'FIFO':
        keyToEvict = this.getFIFOKey();
        break;
    }
    
    if (keyToEvict) {
      this.delete(keyToEvict);
    }
  }
  
  /**
   * Get least recently used key
   */
  private getLRUKey(): string | null {
    let oldest = Infinity;
    let oldestKey: string | null = null;
    
    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldest) {
        oldest = entry.lastAccessed;
        oldestKey = key;
      }
    }
    
    return oldestKey;
  }
  
  /**
   * Get least frequently used key
   */
  private getLFUKey(): string | null {
    let minFrequency = Infinity;
    let lfuKey: string | null = null;
    
    for (const [key, entry] of this.cache) {
      if (entry.frequency < minFrequency) {
        minFrequency = entry.frequency;
        lfuKey = key;
      }
    }
    
    return lfuKey;
  }
  
  /**
   * Get first in first out key
   */
  private getFIFOKey(): string | null {
    let oldest = Infinity;
    let oldestKey: string | null = null;
    
    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldest) {
        oldest = entry.timestamp;
        oldestKey = key;
      }
    }
    
    return oldestKey;
  }
  
  /**
   * Estimate size of data
   */
  private estimateSize(data: any): number {
    if (typeof data === 'string') {
      return data.length * 2; // Unicode characters
    }
    
    if (data instanceof Blob) {
      return data.size;
    }
    
    // Rough estimation for objects
    return JSON.stringify(data).length * 2;
  }
  
  /**
   * Get cache statistics
   */
  public getStats(): {
    size: number;
    itemCount: number;
    hitRate: number;
    utilizationPercent: number;
  } {
    return {
      size: this.totalSize,
      itemCount: this.cache.size,
      hitRate: 0, // Would need to track hits/misses
      utilizationPercent: (this.totalSize / this.config.maxSize) * 100
    };
  }
}

/**
 * Image optimization and lazy loading
 */
class ImageOptimizer {
  private observer: IntersectionObserver | null = null;
  private loadedImages = new Set<string>();
  
  constructor() {
    this.initializeObserver();
  }
  
  /**
   * Initialize Intersection Observer for lazy loading
   */
  private initializeObserver(): void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      return;
    }
    
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            this.loadImage(img);
          }
        });
      },
      {
        rootMargin: '50px',
        threshold: 0.01
      }
    );
  }
  
  /**
   * Setup lazy loading for an image
   */
  public lazyLoad(img: HTMLImageElement): void {
    if (!this.observer) {
      // Fallback: load immediately if no IntersectionObserver
      this.loadImage(img);
      return;
    }
    
    this.observer.observe(img);
  }
  
  /**
   * Load an image
   */
  private loadImage(img: HTMLImageElement): void {
    const src = img.dataset.src;
    
    if (!src || this.loadedImages.has(src)) {
      return;
    }
    
    // Create a new image to preload
    const tempImg = new Image();
    
    tempImg.onload = () => {
      img.src = src;
      img.classList.add('loaded');
      this.loadedImages.add(src);
      
      if (this.observer) {
        this.observer.unobserve(img);
      }
    };
    
    tempImg.onerror = () => {
      logger.error(`Failed to load image: ${src}`);
      img.classList.add('error');
    };
    
    tempImg.src = src;
  }
  
  /**
   * Optimize image for web
   */
  public async optimizeImage(
    file: File,
    options: {
      maxWidth?: number;
      maxHeight?: number;
      quality?: number;
      format?: 'webp' | 'jpeg' | 'png';
    } = {}
  ): Promise<Blob> {
    const {
      maxWidth = 2048,
      maxHeight = 2048,
      quality = 0.85,
      format = 'webp'
    } = options;
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        // Calculate new dimensions
        let { width, height } = img;
        
        if (width > maxWidth || height > maxHeight) {
          const scale = Math.min(maxWidth / width, maxHeight / height);
          width *= scale;
          height *= scale;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Apply optimizations
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Draw and optimize
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create blob'));
            }
          },
          `image/${format}`,
          quality
        );
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }
  
  /**
   * Generate responsive image srcset
   */
  public generateSrcSet(
    baseUrl: string,
    widths: number[] = [320, 640, 960, 1280, 1920]
  ): string {
    return widths
      .map(width => `${baseUrl}?w=${width} ${width}w`)
      .join(', ');
  }
  
  /**
   * Cleanup
   */
  public destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}

/**
 * Web Worker manager for heavy computations
 */
class WorkerManager {
  private workers = new Map<string, Worker>();
  private maxWorkers = navigator.hardwareConcurrency || 4;
  
  /**
   * Create or get a worker
   */
  public getWorker(name: string, scriptUrl: string): Worker {
    if (this.workers.has(name)) {
      return this.workers.get(name)!;
    }
    
    if (this.workers.size >= this.maxWorkers) {
      // Remove oldest worker
      const firstKey = this.workers.keys().next().value;
      this.terminateWorker(firstKey);
    }
    
    const worker = new Worker(scriptUrl);
    this.workers.set(name, worker);
    
    return worker;
  }
  
  /**
   * Execute task in worker
   */
  public async executeTask<T>(
    workerName: string,
    scriptUrl: string,
    data: any
  ): Promise<T> {
    const worker = this.getWorker(workerName, scriptUrl);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker timeout'));
      }, 30000);
      
      worker.onmessage = (e) => {
        clearTimeout(timeout);
        resolve(e.data);
      };
      
      worker.onerror = (e) => {
        clearTimeout(timeout);
        reject(e);
      };
      
      worker.postMessage(data);
    });
  }
  
  /**
   * Terminate a worker
   */
  public terminateWorker(name: string): void {
    const worker = this.workers.get(name);
    
    if (worker) {
      worker.terminate();
      this.workers.delete(name);
    }
  }
  
  /**
   * Terminate all workers
   */
  public terminateAll(): void {
    for (const [name] of this.workers) {
      this.terminateWorker(name);
    }
  }
}

/**
 * Request debouncer and throttler
 */
class RequestOptimizer {
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private throttleTimestamps = new Map<string, number>();
  
  /**
   * Debounce a function call
   */
  public debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number = 300,
    key?: string
  ): (...args: Parameters<T>) => void {
    const debounceKey = key || func.toString();
    
    return (...args: Parameters<T>) => {
      const existing = this.debounceTimers.get(debounceKey);
      
      if (existing) {
        clearTimeout(existing);
      }
      
      const timer = setTimeout(() => {
        func(...args);
        this.debounceTimers.delete(debounceKey);
      }, delay);
      
      this.debounceTimers.set(debounceKey, timer);
    };
  }
  
  /**
   * Throttle a function call
   */
  public throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number = 100,
    key?: string
  ): (...args: Parameters<T>) => void {
    const throttleKey = key || func.toString();
    
    return (...args: Parameters<T>) => {
      const now = Date.now();
      const lastCall = this.throttleTimestamps.get(throttleKey) || 0;
      
      if (now - lastCall >= limit) {
        func(...args);
        this.throttleTimestamps.set(throttleKey, now);
      }
    };
  }
  
  /**
   * Batch multiple requests
   */
  public async batchRequests<T>(
    requests: (() => Promise<T>)[],
    batchSize: number = 5
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(r => r()));
      results.push(...batchResults);
    }
    
    return results;
  }
}

/**
 * Memory management utilities
 */
class MemoryManager {
  private memoryCheckInterval: NodeJS.Timeout | null = null;
  private warningThreshold = 0.8; // 80% memory usage
  
  /**
   * Start monitoring memory usage
   */
  public startMonitoring(interval: number = 10000): void {
    if (!('memory' in performance)) {
      logger.warn('Performance.memory API not available');
      return;
    }
    
    this.memoryCheckInterval = setInterval(() => {
      this.checkMemory();
    }, interval);
  }
  
  /**
   * Check memory usage
   */
  private checkMemory(): void {
    const memory = (performance as any).memory;
    
    if (!memory) return;
    
    const usageRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
    
    if (usageRatio > this.warningThreshold) {
      logger.warn(`High memory usage: ${(usageRatio * 100).toFixed(2)}%`);
      this.triggerCleanup();
    }
  }
  
  /**
   * Trigger memory cleanup
   */
  private triggerCleanup(): void {
    // Clear caches
    imageCache.clear();
    apiCache.clear();
    
    // Force garbage collection if available
    if ('gc' in window) {
      (window as any).gc();
    }
    
    logger.log('Memory cleanup triggered');
  }
  
  /**
   * Stop monitoring
   */
  public stopMonitoring(): void {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
  }
  
  /**
   * Get memory stats
   */
  public getStats(): any {
    if (!('memory' in performance)) {
      return null;
    }
    
    const memory = (performance as any).memory;
    
    return {
      used: memory.usedJSHeapSize,
      total: memory.jsHeapSizeLimit,
      usagePercent: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
    };
  }
}

// Create singleton instances
export const imageCache = new CacheManager<string>({
  maxSize: 20 * 1024 * 1024, // 20MB for images
  maxAge: 60 * 60 * 1000, // 1 hour
  strategy: 'LRU'
});

export const apiCache = new CacheManager({
  maxSize: 10 * 1024 * 1024, // 10MB for API responses
  maxAge: 15 * 60 * 1000, // 15 minutes
  strategy: 'LFU'
});

export const imageOptimizer = new ImageOptimizer();
export const workerManager = new WorkerManager();
export const requestOptimizer = new RequestOptimizer();
export const memoryManager = new MemoryManager();

// Performance monitoring
export function measurePerformance<T>(
  name: string,
  fn: () => T | Promise<T>
): T | Promise<T> {
  const start = performance.now();
  
  try {
    const result = fn();
    
    if (result instanceof Promise) {
      return result.finally(() => {
        const duration = performance.now() - start;
        logger.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
      });
    }
    
    const duration = performance.now() - start;
    logger.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
    
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    logger.error(`[Performance] ${name} failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
}

// Initialize memory monitoring in production
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
  memoryManager.startMonitoring();
}