import { useEffect, useState } from 'react'
import './App.css'
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import { Subject } from 'rxjs';
import { NativeEventSource, EventSourcePolyfill } from 'event-source-polyfill';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { wrappedKeyEncryptionCryptoJsStorage } from 'rxdb/plugins/encryption-crypto-js';

const encryptedDexieStorage = wrappedKeyEncryptionCryptoJsStorage({
  storage: getRxStorageDexie()
});

let dbPromise = null;
const createDB = async () => {
  const db = await createRxDatabase({
    name: 'rxdb-sample',
    storage: encryptedDexieStorage,
    password: 'sudoLetMeIn',
    ignoreDuplicate: true,
    localDocuments: true,
    cleanupPolicy: {
      minimumDeletedTime: 10000, // one month, 
      minimumCollectionAge: 10000, // 60 seconds 
      runEach: 10000, // 5 minutes 
      awaitReplicationsInSync: true,
      waitForLeadership: true
    },

  });

  const todoSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
      id: {
        type: 'string',
        maxLength: 100 // <- the primary key must have set maxLength
      },
      name: {
        type: 'string',
      },
      done: {
        type: 'boolean'
      },
      timestamp: {
        type: 'string',
        format: 'date-time'
      }
    },
    required: ['id', 'name', 'done', 'timestamp'],
  }

  const listSchema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
      id: {
        type: 'string',
        maxLength: 100 // <- the primary key must have set maxLength
      },
      description: {
        type: 'string',
      },
      list_id: {
        type: 'string',
        ref: 'todos'
      },
    },
    required: ['id', 'list_id'],
    encrypted: ['description'],
  }


  await db.addCollections({
    todos: {
      schema: todoSchema
    },
    list: {
      schema: listSchema,
      localDocuments: true
    },
  });

  await db.list.insert({
    id: (+ new Date()).toString(),
    description: 'enkripsi -----',
    list_id: '123asdfg'
  });

  await db.list.insertLocal('localPride', {
    id: (+ new Date()).toString(),
    description: 'local pride',
  });


  
  return db;
}
const initialState = {
  "name": "",
  "done": false,
  "timestamp": + new Date(),
}

const urlDani = {
  "pull": "https://ca99-103-81-220-21.ngrok-free.app/pull",
  "push": "https://ca99-103-81-220-21.ngrok-free.app/push",
  "stream": "https://ca99-103-81-220-21.ngrok-free.app/pullStream",
}

const urlSort = {
  "pull": "https://sort.my.id/rxdb",
  "push": "https://sort.my.id/rxdb",
  "stream": "https://sort.my.id/rxdb/pull_stream",
  "login": "https://sort.my.id/login",
}

const urlDev = !urlDani ? urlDani : urlSort;

function App() {
  const [show, setSHow] = useState(true);
  const [leader, setLeader] = useState(false);
  const [data, setData] = useState([]);
  const [formState, setFormState] = useState(initialState);
  const [formupdate, setFormUpdate] = useState(initialState);

  function setInput(key, value) {
    setFormState({ ...formState, [key]: value });
  }

  function setInputUpdate(key, value) {
    setFormUpdate({ ...formupdate, [key]: value });
  }

  const getDB = () => {
    if (!dbPromise) dbPromise = createDB();
    return dbPromise;
  };

  const createData = async () => {
    const db = await getDB();
    formState.id = (+ new Date()).toString();
    await db.todos.insert(formState);
    await db.list.insert({
      id: formState.id,
      description: 'referral -----',
      list_id: formState.id
    });
    setFormState(initialState)
  }

  const handleCLickUpdate = (data) => {
    setFormUpdate({
      id: data.id,
      name: data.name,
    })
    setSHow(false);
  }

  const updateData = async () => {
    setSHow(true);
    const db = await getDB();

    const query = db.todos.find({
      selector: {
        id: formupdate.id
      }
    });
    await query.patch({
      name: formupdate.name,
    });
  }

  const subscribe = async () => {
    const db = await getDB();
    const query = db.todos.find();
    const querySub = query.$.subscribe(results => {

      setData(results)
    });
    // console.log(await db.list.find().exec());

    const localDoc = await db.list.getLocal('localPride');
    console.log(localDoc);
    console.log(localDoc.get('description'));
    
    const subscription = db.list.getLocal$('localPride').subscribe(documentOrNull => {
      console.dir(documentOrNull); // > RxLocalDocument or null
    });
    // stop watching this query
    return () => {
      querySub.unsubscribe()
      subscription.unsubscribe()
    }
  }

  const handleDelete = async (data) => {
    const db = await getDB();
    const query = db.todos.find({
      selector: {
        id: data.id
      }
    });
    await query.remove();
  }

  const handleDetail = async (data) => {
    const db = await getDB();
    const doc = await db.list.findOne(data.id).exec();
    console.log(doc);

    const todo = await doc.populate('list_id');
    console.log(todo);
  }


  const replication = (collection) => {
    const myPullStream$ = new Subject();
    if (localStorage.getItem('token')) {
      var eventSource = new EventSourcePolyfill(urlDev.stream, {
        headers: {
          'Authorization': localStorage.getItem('token')
        }
      });
      eventSource.addEventListener("message", (event) => {
        const eventData = JSON.parse(event.data);
        myPullStream$.next({
          documents: eventData.documents,
          checkpoint: eventData.checkpoint,
        });
      });

      eventSource.addEventListener("error", (e) => {
        console.log(e);

        myPullStream$.next("RESYNC")

      });
    }

    replicateRxCollection({
      collection: collection.todos,
      push: {
        async handler(body) {
          const response = await fetch(urlDev.push + '/push', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': localStorage.getItem('token'),
            },
            body: JSON.stringify(body)
          });

          const data = await response.json();
          console.log(data);
          return data;
        }
      },
      pull: {
        async handler(checkpointOrNull, batchSize) {
          const response = await fetch(urlDev.pull + '/pull', {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Authorization': localStorage.getItem('token'),
            },
          });
          const data = await response.json();
          return {
            documents: data.documents,
            checkpoint: data.checkpoint
          };
        },
        stream$: myPullStream$.asObservable()
      }
    });
  }

  const getReplica = async () => {
    const db = await getDB();
    db.waitForLeadership()
      .then(() => {
        console.log('Long lives the king!'); // <- runs when db becomes leader
        setLeader(true);
      });
    replication(db);
  }

  useEffect(() => {
    document.title = leader ? 'leader' : 'instance';
    
  }, [leader]);

  useEffect(() => {
    subscribe();
    getReplica()
  }, [localStorage.getItem('token')]);

  const handleLogin = async () => {
    const body = {
      "username": "dea.edria@gmail.com"
    }
    const response = await fetch(urlDev.login, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const { data } = await response.json();
    localStorage.setItem('token', data.jwt)
    console.log(data);
    subscribe();
  }

  const handleLogin2 = async () => {
    const body = {
      "username": "irfanfandi38@gmail.com"
    }
    const response = await fetch(urlDev.login, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const { data } = await response.json();
    localStorage.setItem('token', data.jwt)
    console.log(data);
    subscribe();
  }

  const handleClean = async () => {
    const db = await getDB();
    const clean = await db.todos.cleanup();
    console.log(clean);

  }

  const setStates = async () => {
    const db = await getDB();
    const myState = await db.addState();
    await myState.set('initState', v => 'value state bla bla bal------');
    const val = myState.get();
    console.log(val);
    const valstate = myState.get('initState');
    console.log(valstate);

    const observable = myState.get$('initState');
    observable.subscribe(newValue => {
      console.log('New value:', newValue);
    });
  }
  const handleSetState = async () => {
    const db = await getDB();
    const myState = await db.addState();
    await myState.set('initState', v => 'change value state bla bla bal------');
  }

  useEffect(() => {
    setStates()
  }, []);

  return (
    <>
      <div>
        <span>
          <button onClick={() => handleLogin()}>Dea</button>
        </span>
        <span>
          <button onClick={() => handleLogin2()}>Fandi</button>
        </span>
        <span>
          <button onClick={() => handleClean()}>Clean</button>
        </span>
        <span>
          <button onClick={() => handleSetState()}>State</button>
        </span>
      </div>
      <div>
        <a href="#" target="_blank">
          <img src="https://rxdb.info/files/logo/logo.svg" className="logo react" alt="React logo" />
        </a>
      </div>

      {show
        ?
        <div>
          <input type="text" value={formState.name} onChange={(e) => setInput('name', e.target.value)} />
          <button onClick={() => createData()}>Submit</button>
        </div>
        :
        <div>
          <input type="text" value={formupdate.name} onChange={(e) => setInputUpdate('name', e.target.value)} />
          <button onClick={() => updateData()}>Update</button>
        </div>
      }


      {data && data.length > 0 && data.map((item) => {
        return (
          <div key={item.id} style={{ margin: 5 }}>
            <span style={{ padding: 10 }}>
              {item.name}
            </span>
            <span>
              <button onClick={() => handleCLickUpdate(item)}>update</button>
            </span>
            <span>
              <button onClick={() => handleDetail(item)}>detail</button>
            </span>
            <span>
              <button onClick={() => handleDelete(item)}>delete</button>
            </span>
          </div>
        )
      })}

    </>
  )
}

export default App
