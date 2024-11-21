import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { addRxPlugin } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBCleanupPlugin } from 'rxdb/plugins/cleanup';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';
import { RxDBStatePlugin } from 'rxdb/plugins/state';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';

addRxPlugin(RxDBLocalDocumentsPlugin);
addRxPlugin(RxDBStatePlugin);
addRxPlugin(RxDBCleanupPlugin);
addRxPlugin(RxDBDevModePlugin);
addRxPlugin(RxDBLeaderElectionPlugin);
createRoot(document.getElementById('root')).render(
    <App />
)
