// Entry point. Scene files register with the engine on import; catalog.js must come first.
// Three.js is loaded lazily by the engine, so the lesson text still works if 3D can't start.
import { CN } from './engine.js';
import '../scenes/catalog.js';
import '../scenes/week1.js';
import '../scenes/reviews.js';

CN.start();
