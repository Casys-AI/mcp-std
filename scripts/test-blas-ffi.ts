#!/usr/bin/env -S deno run --allow-ffi --unstable-ffi
/**
 * Test BLAS FFI for matrix multiplication
 *
 * Run: deno run --allow-ffi --unstable-ffi scripts/test-blas-ffi.ts
 */

// CBLAS constants
const CblasRowMajor = 101;
const CblasNoTrans = 111;

// Find BLAS library (prefer OpenBLAS)
const BLAS_PATHS = [
  "/lib/x86_64-linux-gnu/libopenblas.so.0",  // OpenBLAS first
  "/lib/x86_64-linux-gnu/libopenblas.so",
  "/usr/lib/x86_64-linux-gnu/blas/libblas.so.3",
  "/lib/x86_64-linux-gnu/libblas.so.3",
  "/usr/lib/libblas.so.3",
  "libblas.so.3",
];

let blasLib: Deno.DynamicLibrary<{
  cblas_sgemm: {
    parameters: ["i32", "i32", "i32", "i32", "i32", "i32", "f32", "pointer", "i32", "pointer", "i32", "f32", "pointer", "i32"];
    result: "void";
  };
}> | null = null;

for (const path of BLAS_PATHS) {
  try {
    blasLib = Deno.dlopen(path, {
      // cblas_sgemm(order, transA, transB, M, N, K, alpha, A, lda, B, ldb, beta, C, ldc)
      cblas_sgemm: {
        parameters: ["i32", "i32", "i32", "i32", "i32", "i32", "f32", "pointer", "i32", "pointer", "i32", "f32", "pointer", "i32"],
        result: "void",
      },
    });
    console.log(`✓ Loaded BLAS from: ${path}`);
    break;
  } catch (e) {
    console.log(`✗ Failed to load ${path}: ${e.message}`);
  }
}

if (!blasLib) {
  console.error("Could not load BLAS library");
  Deno.exit(1);
}

/**
 * Matrix multiplication using BLAS: C = A @ B
 *
 * @param A - Matrix A [M][K] as flat Float32Array
 * @param B - Matrix B [K][N] as flat Float32Array
 * @param M - Rows of A
 * @param K - Cols of A / Rows of B
 * @param N - Cols of B
 * @returns C - Result matrix [M][N] as flat Float32Array
 */
function blasMatmul(A: Float32Array, B: Float32Array, M: number, K: number, N: number): Float32Array {
  const C = new Float32Array(M * N);

  // Get pointers to the typed arrays
  const ptrA = Deno.UnsafePointer.of(A);
  const ptrB = Deno.UnsafePointer.of(B);
  const ptrC = Deno.UnsafePointer.of(C);

  // cblas_sgemm: C = alpha * A @ B + beta * C
  // With alpha=1, beta=0: C = A @ B
  blasLib!.symbols.cblas_sgemm(
    CblasRowMajor,  // row-major order
    CblasNoTrans,   // don't transpose A
    CblasNoTrans,   // don't transpose B
    M, N, K,        // dimensions
    1.0,            // alpha
    ptrA!, K,       // A and leading dimension of A
    ptrB!, N,       // B and leading dimension of B
    0.0,            // beta
    ptrC!, N,       // C and leading dimension of C
  );

  return C;
}

// Test with small matrices
console.log("\n--- Small Matrix Test (2x3 @ 3x2) ---");
const A_small = new Float32Array([1, 2, 3, 4, 5, 6]); // 2x3
const B_small = new Float32Array([1, 2, 3, 4, 5, 6]); // 3x2
const C_small = blasMatmul(A_small, B_small, 2, 3, 2);
console.log("A:", A_small);
console.log("B:", B_small);
console.log("C = A @ B:", C_small);
// Expected: [[22, 28], [49, 64]]

// Benchmark: Compare JS vs BLAS for larger matrices
console.log("\n--- Benchmark: 105x1024 @ 1024x64 (like our K computation) ---");

const M = 105, K = 1024, N = 64;
const A_big = new Float32Array(M * K);
const B_big = new Float32Array(K * N);

// Fill with random data
for (let i = 0; i < A_big.length; i++) A_big[i] = Math.random();
for (let i = 0; i < B_big.length; i++) B_big[i] = Math.random();

// JS implementation
function jsMatmul(A: Float32Array, B: Float32Array, M: number, K: number, N: number): Float32Array {
  const C = new Float32Array(M * N);
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < N; j++) {
      let sum = 0;
      for (let k = 0; k < K; k++) {
        sum += A[i * K + k] * B[k * N + j];
      }
      C[i * N + j] = sum;
    }
  }
  return C;
}

// Warmup
for (let i = 0; i < 3; i++) {
  jsMatmul(A_big, B_big, M, K, N);
  blasMatmul(A_big, B_big, M, K, N);
}

// Benchmark JS
const jsIterations = 50;
const jsStart = performance.now();
for (let i = 0; i < jsIterations; i++) {
  jsMatmul(A_big, B_big, M, K, N);
}
const jsTime = (performance.now() - jsStart) / jsIterations;

// Benchmark BLAS
const blasIterations = 50;
const blasStart = performance.now();
for (let i = 0; i < blasIterations; i++) {
  blasMatmul(A_big, B_big, M, K, N);
}
const blasTime = (performance.now() - blasStart) / blasIterations;

console.log(`JS matmul:   ${jsTime.toFixed(2)}ms per call`);
console.log(`BLAS matmul: ${blasTime.toFixed(2)}ms per call`);
console.log(`Speedup:     ${(jsTime / blasTime).toFixed(1)}x`);

// Verify results match
const jsResult = jsMatmul(A_big, B_big, M, K, N);
const blasResult = blasMatmul(A_big, B_big, M, K, N);
let maxDiff = 0;
for (let i = 0; i < jsResult.length; i++) {
  maxDiff = Math.max(maxDiff, Math.abs(jsResult[i] - blasResult[i]));
}
console.log(`Max difference: ${maxDiff.toExponential(2)} (should be ~0)`);

blasLib.close();
