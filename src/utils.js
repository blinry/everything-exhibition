var timings = {}

export function timeStart(category) {
    var timer = {
        start: performance.now(),
        category: category,
    }
    return timer
}

export function timeEnd(timer) {
    var end = performance.now()
    var duration = (end - timer.start) / 1000 // seconds
    if (!timings[timer.category]) {
        timings[timer.category] = 0
    }
    timings[timer.category] += duration
}

export function timeReset() {
    timings = {}
}

export function timeDump() {
    console.log(timings)
}

export function lerp(a, b, amount) {
    amount = amount < 0 ? 0 : amount
    amount = amount > 1 ? 1 : amount
    return a + (b - a) * amount
}
