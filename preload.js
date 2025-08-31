const { contextBridge, ipcRenderer } = require('electron');
function rid(){ return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`; }

contextBridge.exposeInMainWorld('api', {
  sessions: {
    load: () => ipcRenderer.invoke('sessions:load'),
    save: (data) => ipcRenderer.invoke('sessions:save', data),
  },
  chat: {
    stream(messages, model='glm-4.5-flash', onEvent){
      const id = rid();
      const onChunk = (_e, t) => { try{ onEvent(t); }catch{} };
      const onDone  = (_e) => { cleanup(); try{ onEvent(null); }catch{} };
      const onErr   = (_e, m) => { cleanup(); try{ onEvent({error:m}); }catch{} };
      function cleanup(){
        ipcRenderer.removeAllListeners(`chat:chunk-${id}`);
        ipcRenderer.removeAllListeners(`chat:done-${id}`);
        ipcRenderer.removeAllListeners(`chat:error-${id}`);
      }
      ipcRenderer.on(`chat:chunk-${id}`, onChunk);
      ipcRenderer.once(`chat:done-${id}`, onDone);
      ipcRenderer.once(`chat:error-${id}`, onErr);
      ipcRenderer.send('chat:stream-start', { reqId:id, messages, model });
      return { cancel: () => { cleanup(); ipcRenderer.send('chat:stream-cancel', id); } };
    },
    titleSuggest: (text, model='glm-4.5-flash') => ipcRenderer.invoke('chat:title', { text, model })
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  }
});