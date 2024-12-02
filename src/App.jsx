import { useEffect, useState } from 'react'
import './App.css'
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import { Subject } from 'rxjs';
import { NativeEventSource, EventSourcePolyfill } from 'event-source-polyfill';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { wrappedKeyEncryptionCryptoJsStorage } from 'rxdb/plugins/encryption-crypto-js';
import { replicateGraphQL } from 'rxdb/plugins/replication-graphql';

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
    primaryKey: "id",
    type: "object",
    properties: {
      id: {
        type: "string",
        maxLength: 100, // <- the primary key must have set maxLength
      },
      name: {
        type: "string",
      },
      updatedAt: {
        type: "string",
        format: "date-time",
      },
    },
    required: ["id"],
    encrypted: ["name"],
  };

  await db.addCollections({
    todos: {
      schema: todoSchema
    }, 
  });

  return db;
}
const initialState = {
  "name": "",
  "deleted": false,
  "updatedAt": + new Date(),
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

const urlGraphql = {
  url: "https://fhjg2jorrbfm3atgef64guuqma.appsync-api.us-east-2.amazonaws.com/graphql",
  wss: "wss://fhjg2jorrbfm3atgef64guuqma.appsync-realtime-api.us-east-2.amazonaws.com/graphql",
  token: "da2-zwxailbg3vdq3cdsrfcrkve3me",
};

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
      console.log(results);
      
      setData(results)
    });
    // console.log(await db.list.find().exec());

    // stop watching this query
    return () => {
      querySub.unsubscribe()
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


  const pullQueryBuilder = () => {
    const query = `query PullTodos {
      pullTodo{
          checkpoint {
            updatedAt
            id
          }
          documents {
            id
            name
            updatedAt
            deleted
          }
        }
      }`;
    return {
      query,
      operationName: "PullTodos",
      variables: null,
    };
  };

  const pushMutationBuilder = (rows) => {
    // Ensure rows is always an array
    const rowsArray = Array.isArray(rows) ? rows : [rows];

    const query = `mutation PushTodo($writeRows: [TodoInputPushRow!]!) {
      pushTodo(rows: $writeRows) {
        id
        name
        updatedAt
        deleted
      }
    }`;

    const variables = {
      writeRows: rowsArray, // Use the wrapped array
    };

    return {
      query,
      operationName: "PushTodo",
      variables,
    };
  };

  const replication = async () => {
    const db = await getDB();

    replicateGraphQL({
      collection: db.todos,
      url: {
        http: urlGraphql.url,
        ws: urlGraphql.wss,
      }, 
      headers: {
        "x-api-key": urlGraphql.token,
      },
      push: {
        queryBuilder: pushMutationBuilder,
      },
      pull: {
        queryBuilder: pullQueryBuilder,
        includeWsHeaders: true,
        wsOptions: {
          retryAttempts: 10,
        },
      },
      deletedField: "deleted",
      live: true,
    });

    // // emits each document that was received from the remote
    // replicateState.received$.subscribe((doc) => console.dir(doc));

    // // emits each document that was send to the remote
    // replicateState.sent$.subscribe((doc) => console.dir(doc));

    // // emits all errors that happen when running the push- & pull-handlers.
    // replicateState.error$.subscribe((error) => console.dir(error));
  };



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
    // console.log(val);
    const valstate = myState.get('initState');
    // console.log(valstate);

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

  const handleSetLocal = async () => {
    const db = await getDB();
    const id = 'LOKAL'+(+ new Date()).toString()
    await db.locals.insertLocal(id, {
      id: (+ new Date()).toString()+ 'LOKAL',
      description: 'local pride '+id,
    });
    const localDoc = await db.locals.getLocal(id);
    console.log(localDoc);
    console.log(localDoc.get('description'));
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
        <span>
          <button onClick={() => handleSetLocal()}>Local</button>
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
            {/* <span>
              <button onClick={() => handleDetail(item)}>detail</button>
            </span> */}
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
