function median(sortedValues) {
  const middle = Math.floor(sortedValues.length / 2)
  return sortedValues.length % 2 === 0
    ? (sortedValues[middle - 1] + sortedValues[middle]) / 2
    : sortedValues[middle]
}

export function summarizeValues(values) {
  if (values.length === 0) throw new Error('至少需要一个数值样本')
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const lower = sorted.length === 1 ? sorted : sorted.slice(0, middle)
  const upper = sorted.length === 1
    ? sorted
    : sorted.slice(sorted.length % 2 === 0 ? middle : middle + 1)
  const q1 = median(lower)
  const q3 = median(upper)
  return { median: median(sorted), q1, q3, iqr: q3 - q1 }
}

function summarizePhase(samples, phase) {
  return {
    avgFps: summarizeValues(samples.map((sample) => sample[phase].avgFps)),
    frameTimeMs: {
      median: summarizeValues(samples.map((sample) => sample[phase].frameTimeMs.median)),
      p95: summarizeValues(samples.map((sample) => sample[phase].frameTimeMs.p95)),
      max: summarizeValues(samples.map((sample) => sample[phase].frameTimeMs.max)),
    },
    longFrames: summarizeValues(samples.map((sample) => sample[phase].longFrames)),
  }
}

export function aggregateSamples(samples) {
  const completed = samples.filter((sample) => sample.status === 'completed')
  return {
    samples,
    completedSampleCount: completed.length,
    aggregate: completed.length === 0 ? null : {
      firstScreen: {
        elapsedMs: summarizeValues(completed.map((sample) => sample.firstScreen.elapsedMs)),
      },
      drag: summarizePhase(completed, 'drag'),
      pan: summarizePhase(completed, 'pan'),
    },
  }
}
