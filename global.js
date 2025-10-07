const performance = require('.')

global.performance = performance
global.PerformanceEntry = performance.PerformanceEntry
global.PerformanceMark = performance.PerformanceMark
global.PerformanceMeasure = performance.PerformanceMeasure
global.PerformanceObserver = performance.PerformanceObserver
global.PerformanceObserverEntryList = performance.PerformanceObserverEntryList
