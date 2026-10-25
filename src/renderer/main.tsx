import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/plus-jakarta-sans';
import { App } from './App';
import { UpdateNotice } from './UpdateNotice';
import { Tooltip } from './Tooltip';
import './styles.css';
// La ventana del tooltip es transparente: el fondo del documento debe serlo también.
if (location.hash === '#tooltip') document.documentElement.classList.add('tooltip-root');
const view = location.hash === '#update-notice' ? <UpdateNotice /> : location.hash === '#tooltip' ? <Tooltip /> : <App />;
createRoot(document.getElementById('root')!).render(<React.StrictMode>{view}</React.StrictMode>);
