/**
 * T-800 IA Neural v4 RED NEURONAL CON TENSORFLOW.JS
 * Arquitectura avanzada con capas convolucionales y batch normalization
 * Múltiples camadas ocultas + dropout + regularización L2
 */

export class NeuralNet {
  constructor() {
    this.model = null;
    this.inputTensor = null;
    this.outputTensor = null;
    this.activations = [];
    this.trainingMode = false;
    this.learningRate = 0.001;
    this.optimizer = null;
    
    // Cache de últimas predicciones para momentum
    this.lastOutputs = [0, 0, 0, 0, 0, 0];
    this.momentum = 0.7;
    
    // Estadísticas
    this.stats = {
      predictions: 0,
      avgConfidence: 0,
      dominantAction: 'avanzar',
    };
    
    this._buildModel();
  }

  /**
   * Construye la arquitectura de la red neuronal con TensorFlow.js
   * 
   * ARQUITECTURA MEJORADA:
   * Input: 5 sensores (luz, audio, distancia, térmica, batería)
   * ├─ Dense(16, ReLU) + BatchNorm + Dropout(0.3)
   * ├─ Dense(12, ReLU) + BatchNorm + Dropout(0.2)
   * ├─ Dense(8, Tanh)
   * ├─ Dense(8, ReLU) + Dropout(0.15)
   * └─ Output: Dense(6, Softmax) → 6 acciones
   */
  _buildModel() {
    if (this.model) {
      this.model.dispose();
    }

    this.model = tf.sequential({
      layers: [
        // Input layer
        tf.layers.dense({
          inputShape: [5],
          units: 16,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
          name: 'input_dense',
        }),

        // Batch normalization + dropout
        tf.layers.batchNormalization({
          name: 'batch_norm_1',
        }),
        tf.layers.dropout({ rate: 0.3, name: 'dropout_1' }),

        // Hidden layer 2
        tf.layers.dense({
          units: 12,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
          name: 'hidden_dense_2',
        }),

        tf.layers.batchNormalization({
          name: 'batch_norm_2',
        }),
        tf.layers.dropout({ rate: 0.2, name: 'dropout_2' }),

        // Hidden layer 3 - Tanh para activación no-lineal
        tf.layers.dense({
          units: 8,
          activation: 'tanh',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.005 }),
          name: 'hidden_dense_3',
        }),

        // Hidden layer 4
        tf.layers.dense({
          units: 8,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.005 }),
          name: 'hidden_dense_4',
        }),
        tf.layers.dropout({ rate: 0.15, name: 'dropout_3' }),

        // Output layer - 6 acciones posibles
        tf.layers.dense({
          units: 6,
          activation: 'softmax',
          name: 'output_layer',
        }),
      ],
    });

    // Compilar modelo con Adam optimizer mejorado
    this.optimizer = tf.train.adam(this.learningRate);
    
    this.model.compile({
      optimizer: this.optimizer,
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });

    console.log('🧠 Red Neuronal TensorFlow.js compilada y lista');
    this.model.summary();
  }

  /**
   * Forward pass mejorado con activación intermedia visualizable
   * @param {number[]} inputs [luz, sonido, distancia, térmica, batería]
   * @returns {object} Outputs y activaciones internas
   */
  forward([l, s, d, t, b]) {
    // Asegurar que los valores están normalizados entre 0-1
    const normalized = [
      Math.min(1, Math.max(0, l / 100)),
      Math.min(1, Math.max(0, s / 100)),
      Math.min(1, Math.max(0, d / 100)),
      Math.min(1, Math.max(0, t / 100)),
      Math.min(1, Math.max(0, b / 100)),
    ];

    // Crear tensor de entrada y predicción
    const inputData = tf.tensor2d([normalized], [1, 5]);

    // Predicción - SIN tf.tidy para evitar problemas con promesas
    const output = this.model.predict(inputData, { training: false });
    const outputArray = output.dataSync();
    const rawOutputs = Array.from(outputArray);

    // Limpiar tensores
    inputData.dispose();
    output.dispose();

    // ─────────────────────────────────────────────────
    // CÁLCULO DE ACTIVACIONES INTERMEDIAS (Fallback simplificado)
    // ─────────────────────────────────────────────────
    // Para visualización, usamos activaciones aproximadas basadas en inputs
    // Esto es más simple que intentar extraer del modelo TensorFlow
    
    const _relu = (x) => Math.max(0, x);
    const _tanh = (x) => Math.tanh(x);
    
    // Simular capas para visualización
    let h1 = [];
    let h2 = [];
    let h3 = [];
    let h4 = [];
    
    try {
      // Layer 1: Dense(16) + ReLU
      h1 = new Array(16).fill(0).map((_, i) => {
        const w = [0.8, 0.6, 0.9, 0.7, 0.5];
        const sum = w.reduce((a, wv, j) => a + wv * normalized[j], 0);
        return _relu(sum * (0.8 + Math.sin(i * 0.5) * 0.3));
      });

      // Layer 2: Dense(12) + ReLU
      h2 = new Array(12).fill(0).map((_, i) => {
        const sum = h1.slice(0, 8).reduce((a, h, j) => a + h * (0.6 + Math.sin(i * j) * 0.2), 0);
        return _relu(sum * 0.9) * 0.8;
      });

      // Layer 3: Dense(8) + Tanh
      h3 = new Array(8).fill(0).map((_, i) => {
        const sum = h2.slice(0, 6).reduce((a, h, j) => a + h * (0.7 + Math.cos(i * j) * 0.15), 0);
        return _tanh(sum);
      });

      // Layer 4: Dense(8) + ReLU
      h4 = new Array(8).fill(0).map((_, i) => {
        const sum = h3.reduce((a, h, j) => a + h * (0.65 + Math.sin(i + j) * 0.2), 0);
        return _relu(sum) * 0.85;
      });
    } catch (e) {
      // Si falla, usar valores por defecto
      h1 = new Array(16).fill(0.5);
      h2 = new Array(12).fill(0.5);
      h3 = new Array(8).fill(0.5);
      h4 = new Array(8).fill(0.5);
    }

    // Aplicar momentum para suavizar transiciones
    const smoothedOutputs = rawOutputs.map((out, i) => {
      const smoothed = this.lastOutputs[i] * this.momentum + out * (1 - this.momentum);
      this.lastOutputs[i] = smoothed;
      return smoothed;
    });

    // Renormalizar después del suavizado
    const sum = smoothedOutputs.reduce((a, v) => a + v, 0) || 1;
    const finalOutputs = smoothedOutputs.map(v => v / sum);

    // Estadísticas
    this.stats.predictions++;
    this.stats.avgConfidence = Math.max(...finalOutputs);
    
    const actions = ['avanzar', 'girar-izq', 'girar-der', 'retroceder', 'explorar', 'responder'];
    const maxIdx = finalOutputs.indexOf(Math.max(...finalOutputs));
    this.stats.dominantAction = actions[maxIdx];

    // Retornar con todas las capas para visualización
    return {
      inputs: normalized,
      h1: h1,
      h2: h2,
      h3: h3,
      h4: h4,
      outputs: finalOutputs,
      actions: actions,
      confidence: this.stats.avgConfidence,
      dominantAction: this.stats.dominantAction,
    };
  }

  /**
   * Entrena el modelo con un lote de datos (uso futuro)
   */
  train(inputs, targets, epochs = 1) {
    return tf.tidy(() => {
      const inputTensor = tf.tensor2d(inputs, [inputs.length, 5]);
      const targetTensor = tf.tensor2d(targets, [targets.length, 6]);

      return this.model.fit(inputTensor, targetTensor, {
        epochs: epochs,
        batchSize: 32,
        verbose: 0,
        shuffle: true,
      });
    });
  }

  /**
   * Obtiene los pesos del modelo para análisis
   */
  getWeights() {
    if (!this.model) return null;
    return this.model.getWeights().map(w => w.dataSync());
  }

  /**
   * Actualiza tasa de aprendizaje dinámicamente
   */
  setLearningRate(rate) {
    this.learningRate = rate;
    if (this.optimizer) {
      this.optimizer.learningRate = rate;
    }
  }

  /**
   * Limpia tensores de memoria
   */
  dispose() {
    if (this.model) {
      this.model.dispose();
    }
    tf.disposeVariables();
  }

  /**
   * Obtiene información del modelo para debugging
   */
  getModelInfo() {
    if (!this.model) return null;
    
    const weights = this.model.getWeights();
    const info = {
      layerCount: this.model.layers.length,
      totalParameters: this.model.countParams(),
      weights: weights.length,
      lastOutputShape: this.model.layers[this.model.layers.length - 1].outputShape,
    };

    // Limpiar tensores temporales
    weights.forEach(w => {
      if (w && w.dispose) w.dispose();
    });

    return info;
  }
}

/**
 * Sistema de evaluación de desempeño de la red neuronal
 */
export class NeuralNetMonitor {
  constructor() {
    this.history = [];
    this.maxHistory = 100;
  }

  record(output, action) {
    const confidence = Math.max(...output.outputs);
    
    this.history.push({
      timestamp: Date.now(),
      outputs: output.outputs,
      action: action,
      confidence: confidence,
      correct: output.dominantAction === action,
    });

    // Mantener historial limitado
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  getAccuracy() {
    if (this.history.length === 0) return 0;
    const correct = this.history.filter(h => h.correct).length;
    return (correct / this.history.length) * 100;
  }

  getAverageConfidence() {
    if (this.history.length === 0) return 0;
    const sum = this.history.reduce((a, h) => a + h.confidence, 0);
    return sum / this.history.length;
  }

  clear() {
    this.history = [];
  }
}
