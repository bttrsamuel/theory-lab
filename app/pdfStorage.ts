const DB_NAME = 'TheoryLabPDFs';
const STORE_NAME = 'local_pdf_files';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Salva o arquivo PDF no disco local do computador do usuário
export async function saveLocalPDF(articleId: string, file: File): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(file, articleId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Recupera o arquivo PDF do disco local e gera a URL para o visualizador (iframe)
export async function getLocalPDFUrl(articleId: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(articleId);

    request.onsuccess = () => {
      const file = request.result as File | undefined;
      if (file) {
        resolve(URL.createObjectURL(file));
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// Remove o PDF do disco local
export async function deleteLocalPDF(articleId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(articleId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}