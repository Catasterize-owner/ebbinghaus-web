import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import './styles/avatar.css';
import { App } from './App';
import { initRouting } from './lib/nav';
import { resumeAfterReload } from './lib/runtime';

initRouting();
resumeAfterReload();
createRoot(document.getElementById('root')!).render(<App />);
