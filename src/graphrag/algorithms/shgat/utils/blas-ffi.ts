/**
 * BLAS FFI Module for accelerated matrix operations
 *
 * Uses OpenBLAS via Deno FFI for ~10x speedup on matrix multiplication.
 * Falls back to JS implementation if BLAS is not available.
 *
 * @module graphrag/algorithms/shgat/utils/blas-ffi
 */

// CBLAS constants
const CblasRowMajor = 101;
const CblasNoTrans = 111;
const CblasTrans = 112;

// BLAS library paths (prefer OpenBLAS)
const BLAS_PATHS = [
  "/lib/x86_64-linux-gnu/libopenblas.so.0",
  "/lib/x86_64-linux-gnu/libopenblas.so",
  "/usr/lib/x86_64-linux-gnu/openblas-pthread/libblas.so.3",
  "/usr/lib/x86_64-linux-gnu/blas/libblas.so.3",
  "/lib/x86_64-linux-gnu/libblas.so.3",
];

type BlasLib = Deno.DynamicLibrary<{
  cblas_sgemm: {
    parameters: ["i32", "i32", "i32", "i32", "i32", "i32", "f32", "pointer", "i32", "pointer", "i32", "f32", "pointer", "i32"];
    result: "void";
  };
  cblas_sgemv: {
    parameters: ["i32", "i32", "i32", "i32", "f32", "pointer", "i32", "pointer", "i32", "f32", "pointer", "i32"];
    result: "void";
  };
  cblas_sger: {
    parameters: ["i32", "i32", "i32", "f32", "pointer", "i32", "pointer", "i32", "pointer", "i32"];
    result: "void";
  };
}>;

let blasLib: BlasLib | null = null;
let blasAvailable = false;
let initAttempted = false;

/**
 * Initialize BLAS library (lazy, called on first use)
 */
function initBlas(): boolean {
  if (initAttempted) return blasAvailable;
  initAttempted = true;

  // Check if FFI is available
  if (typeof Deno?.dlopen !== "function") {
    console.warn("[BLAS] Deno.dlopen not available - using JS fallback");
    return false;
  }

  for (const path of BLAS_PATHS) {
    try {
      blasLib = Deno.dlopen(path, {
        cblas_sgemm: {
          parameters: ["i32", "i32", "i32", "i32", "i32", "i32", "f32", "pointer", "i32", "pointer", "i32", "f32", "pointer", "i32"],
          result: "void",
        },
        cblas_sgemv: {
          parameters: ["i32", "i32", "i32", "i32", "f32", "pointer", "i32", "pointer", "i32", "f32", "pointer", "i32"],
          result: "void",
        },
        cblas_sger: {
          parameters: ["i32", "i32", "i32", "f32", "pointer", "i32", "pointer", "i32", "pointer", "i32"],
          result: "void",
        },
      });
      blasAvailable = true;
      console.error(`[BLAS] Loaded OpenBLAS from: ${path}`);
      return true;
    } catch {
      // Try next path
    }
  }

  console.warn("[BLAS] Could not load BLAS library - using JS fallback");
  return false;
}

/**
 * Check if BLAS acceleration is available
 */
export function isBlasAvailable(): boolean {
  if (!initAttempted) initBlas();
  return blasAvailable;
}

/**
 * Matrix multiplication using BLAS: C = A @ B
 *
 * @param A - Matrix A as 2D array [M][K]
 * @param B - Matrix B as 2D array [K][N]
 * @returns C - Result matrix [M][N]
 */
export function blasMatmul(A: number[][], B: number[][]): number[][] {
  const M = A.length;
  const K = A[0]?.length || 0;
  const N = B[0]?.length || 0;

  if (M === 0 || K === 0 || N === 0) {
    return Array.from({ length: M }, () => new Array(N).fill(0));
  }

  if (!initAttempted) initBlas();

  if (!blasAvailable || !blasLib) {
    return jsMatmul(A, B);
  }

  // Flatten to Float32Arrays
  const flatA = new Float32Array(M * K);
  const flatB = new Float32Array(K * N);
  const flatC = new Float32Array(M * N);

  for (let i = 0; i < M; i++) {
    for (let j = 0; j < K; j++) {
      flatA[i * K + j] = A[i][j];
    }
  }

  for (let i = 0; i < K; i++) {
    for (let j = 0; j < N; j++) {
      flatB[i * N + j] = B[i][j];
    }
  }

  const ptrA = Deno.UnsafePointer.of(flatA);
  const ptrB = Deno.UnsafePointer.of(flatB);
  const ptrC = Deno.UnsafePointer.of(flatC);

  // cblas_sgemm: C = alpha * A @ B + beta * C
  blasLib.symbols.cblas_sgemm(
    CblasRowMajor,
    CblasNoTrans,
    CblasNoTrans,
    M, N, K,
    1.0,
    ptrA!, K,
    ptrB!, N,
    0.0,
    ptrC!, N,
  );

  // Convert back to 2D array
  const result: number[][] = new Array(M);
  for (let i = 0; i < M; i++) {
    result[i] = new Array(N);
    for (let j = 0; j < N; j++) {
      result[i][j] = flatC[i * N + j];
    }
  }

  return result;
}

/**
 * Matrix multiplication using BLAS: C = A @ B^T
 *
 * @param A - Matrix A as 2D array [M][K]
 * @param B - Matrix B as 2D array [N][K] (will be transposed)
 * @returns C - Result matrix [M][N]
 */
export function blasMatmulTranspose(A: number[][], B: number[][]): number[][] {
  const M = A.length;
  const K = A[0]?.length || 0;
  const N = B.length;

  if (M === 0 || K === 0 || N === 0) {
    return Array.from({ length: M }, () => new Array(N).fill(0));
  }

  if (!initAttempted) initBlas();

  if (!blasAvailable || !blasLib) {
    return jsMatmulTranspose(A, B);
  }

  // Flatten to Float32Arrays
  const flatA = new Float32Array(M * K);
  const flatB = new Float32Array(N * K);
  const flatC = new Float32Array(M * N);

  for (let i = 0; i < M; i++) {
    for (let j = 0; j < K; j++) {
      flatA[i * K + j] = A[i][j];
    }
  }

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < K; j++) {
      flatB[i * K + j] = B[i][j];
    }
  }

  const ptrA = Deno.UnsafePointer.of(flatA);
  const ptrB = Deno.UnsafePointer.of(flatB);
  const ptrC = Deno.UnsafePointer.of(flatC);

  // cblas_sgemm with B transposed: C = A @ B^T
  blasLib.symbols.cblas_sgemm(
    CblasRowMajor,
    CblasNoTrans,
    CblasTrans,
    M, N, K,
    1.0,
    ptrA!, K,
    ptrB!, K,  // ldb = K because B is stored row-major but we transpose
    0.0,
    ptrC!, N,
  );

  // Convert back to 2D array
  const result: number[][] = new Array(M);
  for (let i = 0; i < M; i++) {
    result[i] = new Array(N);
    for (let j = 0; j < N; j++) {
      result[i][j] = flatC[i * N + j];
    }
  }

  return result;
}

/**
 * Matrix-vector multiplication using BLAS: y = A @ x
 *
 * @param A - Matrix A as 2D array [M][N]
 * @param x - Vector x as 1D array [N]
 * @returns y - Result vector [M]
 */
export function blasMatVec(A: number[][], x: number[]): number[] {
  const M = A.length;
  const N = A[0]?.length || 0;

  if (M === 0 || N === 0) {
    return new Array(M).fill(0);
  }

  if (!initAttempted) initBlas();

  if (!blasAvailable || !blasLib) {
    return jsMatVec(A, x);
  }

  // Flatten to Float32Arrays
  const flatA = new Float32Array(M * N);
  const flatX = new Float32Array(N);
  const flatY = new Float32Array(M);

  for (let i = 0; i < M; i++) {
    for (let j = 0; j < N; j++) {
      flatA[i * N + j] = A[i][j];
    }
  }

  for (let i = 0; i < N; i++) {
    flatX[i] = x[i] || 0;
  }

  const ptrA = Deno.UnsafePointer.of(flatA);
  const ptrX = Deno.UnsafePointer.of(flatX);
  const ptrY = Deno.UnsafePointer.of(flatY);

  // cblas_sgemv: y = alpha * A @ x + beta * y
  blasLib.symbols.cblas_sgemv(
    CblasRowMajor,
    CblasNoTrans,
    M, N,
    1.0,       // alpha
    ptrA!, N,  // A, lda
    ptrX!, 1,  // x, incx
    0.0,       // beta
    ptrY!, 1,  // y, incy
  );

  return Array.from(flatY);
}

/**
 * Matrix-vector multiplication using BLAS: y = A^T @ x
 *
 * @param A - Matrix A as 2D array [M][N]
 * @param x - Vector x as 1D array [M]
 * @returns y - Result vector [N]
 */
export function blasMatVecTranspose(A: number[][], x: number[]): number[] {
  const M = A.length;
  const N = A[0]?.length || 0;

  if (M === 0 || N === 0) {
    return new Array(N).fill(0);
  }

  if (!initAttempted) initBlas();

  if (!blasAvailable || !blasLib) {
    return jsMatVecTranspose(A, x);
  }

  // Flatten to Float32Arrays
  const flatA = new Float32Array(M * N);
  const flatX = new Float32Array(M);
  const flatY = new Float32Array(N);

  for (let i = 0; i < M; i++) {
    for (let j = 0; j < N; j++) {
      flatA[i * N + j] = A[i][j];
    }
  }

  for (let i = 0; i < M; i++) {
    flatX[i] = x[i] || 0;
  }

  const ptrA = Deno.UnsafePointer.of(flatA);
  const ptrX = Deno.UnsafePointer.of(flatX);
  const ptrY = Deno.UnsafePointer.of(flatY);

  // cblas_sgemv with transpose: y = A^T @ x
  blasLib.symbols.cblas_sgemv(
    CblasRowMajor,
    CblasTrans,
    M, N,
    1.0,       // alpha
    ptrA!, N,  // A, lda
    ptrX!, 1,  // x, incx
    0.0,       // beta
    ptrY!, 1,  // y, incy
  );

  return Array.from(flatY);
}

/**
 * Outer product (rank-1 update) using BLAS: A = A + alpha * x @ y^T
 *
 * This is used for gradient accumulation: dW += dOut @ input^T
 *
 * @param A - Matrix A as 2D array [M][N] (modified in-place)
 * @param x - Vector x as 1D array [M]
 * @param y - Vector y as 1D array [N]
 * @param alpha - Scalar multiplier (default 1.0)
 * @returns Modified matrix A
 */
export function blasOuterProduct(A: number[][], x: number[], y: number[], alpha: number = 1.0): number[][] {
  const M = x.length;
  const N = y.length;

  if (M === 0 || N === 0) {
    return A;
  }

  if (!initAttempted) initBlas();

  if (!blasAvailable || !blasLib) {
    return jsOuterProductAdd(A, x, y, alpha);
  }

  // Flatten A to Float32Array
  const flatA = new Float32Array(M * N);
  const flatX = new Float32Array(M);
  const flatY = new Float32Array(N);

  for (let i = 0; i < M; i++) {
    for (let j = 0; j < N; j++) {
      flatA[i * N + j] = A[i]?.[j] || 0;
    }
  }

  for (let i = 0; i < M; i++) {
    flatX[i] = x[i] || 0;
  }

  for (let i = 0; i < N; i++) {
    flatY[i] = y[i] || 0;
  }

  const ptrA = Deno.UnsafePointer.of(flatA);
  const ptrX = Deno.UnsafePointer.of(flatX);
  const ptrY = Deno.UnsafePointer.of(flatY);

  // cblas_sger: A = alpha * x @ y^T + A
  blasLib.symbols.cblas_sger(
    CblasRowMajor,
    M, N,
    alpha,
    ptrX!, 1,  // x, incx
    ptrY!, 1,  // y, incy
    ptrA!, N,  // A, lda
  );

  // Convert back to 2D array
  for (let i = 0; i < M; i++) {
    if (!A[i]) A[i] = new Array(N).fill(0);
    for (let j = 0; j < N; j++) {
      A[i][j] = flatA[i * N + j];
    }
  }

  return A;
}

/**
 * JS fallback: Matrix-vector multiplication A @ x
 */
function jsMatVec(A: number[][], x: number[]): number[] {
  const M = A.length;
  const result = new Array(M);
  for (let i = 0; i < M; i++) {
    let sum = 0;
    const row = A[i];
    const len = Math.min(row.length, x.length);
    for (let j = 0; j < len; j++) {
      sum += row[j] * x[j];
    }
    result[i] = sum;
  }
  return result;
}

/**
 * JS fallback: Matrix-vector multiplication A^T @ x
 */
function jsMatVecTranspose(A: number[][], x: number[]): number[] {
  const M = A.length;
  const N = A[0]?.length || 0;
  const result = new Array(N).fill(0);
  for (let i = 0; i < M; i++) {
    const xi = x[i] || 0;
    const row = A[i];
    for (let j = 0; j < N; j++) {
      result[j] += row[j] * xi;
    }
  }
  return result;
}

/**
 * JS fallback: Outer product A + alpha * x @ y^T
 */
function jsOuterProductAdd(A: number[][], x: number[], y: number[], alpha: number): number[][] {
  const M = x.length;
  const N = y.length;
  for (let i = 0; i < M; i++) {
    if (!A[i]) A[i] = new Array(N).fill(0);
    const xi = x[i] * alpha;
    for (let j = 0; j < N; j++) {
      A[i][j] += xi * y[j];
    }
  }
  return A;
}

/**
 * JS fallback: Matrix multiplication A @ B
 */
function jsMatmul(A: number[][], B: number[][]): number[][] {
  const M = A.length;
  const K = A[0]?.length || 0;
  const N = B[0]?.length || 0;

  const result: number[][] = new Array(M);
  for (let i = 0; i < M; i++) {
    result[i] = new Array(N).fill(0);
    for (let j = 0; j < N; j++) {
      let sum = 0;
      for (let p = 0; p < K; p++) {
        sum += A[i][p] * B[p][j];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

/**
 * JS fallback: Matrix multiplication A @ B^T
 */
function jsMatmulTranspose(A: number[][], B: number[][]): number[][] {
  const M = A.length;
  const K = A[0]?.length || 0;
  const N = B.length;

  const result: number[][] = new Array(M);
  for (let i = 0; i < M; i++) {
    result[i] = new Array(N);
    for (let j = 0; j < N; j++) {
      let sum = 0;
      for (let p = 0; p < K; p++) {
        sum += A[i][p] * B[j][p];
      }
      result[i][j] = sum;
    }
  }
  return result;
}

/**
 * Cleanup BLAS library
 */
export function closeBlas(): void {
  if (blasLib) {
    blasLib.close();
    blasLib = null;
    blasAvailable = false;
  }
}
