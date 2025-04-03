// authController.js

const AuthController = {
    // Autenticação com email e senha
    signInWithEmail: function(email, password) {
      if (!email || !password) {
        alert("Email e senha são obrigatórios.");
        return;
      }
  
      firebase.auth().signInWithEmailAndPassword(email, password)
        .then(userCredential => {
          alert("Login com email efetuado com sucesso!");
          console.log("Usuário:", userCredential.user);
        })
        .catch(error => {
          alert("Erro no login: " + error.message);
        });
    },
  
    // Registro com email e senha
    registerWithEmail: function(email, password) {
      if (!email || !password) {
        alert("Email e senha são obrigatórios para registro.");
        return;
      }
  
      firebase.auth().createUserWithEmailAndPassword(email, password)
        .then(userCredential => {
          alert("Registro efetuado com sucesso!");
          console.log("Usuário registrado:", userCredential.user);
        })
        .catch(error => {
          alert("Erro no registro: " + error.message);
        });
    },
  
    // Autenticação via Google
    signInWithGoogle: function() {
      const provider = new firebase.auth.GoogleAuthProvider();
      firebase.auth().signInWithPopup(provider)
        .then(result => {
          alert("Login com Google efetuado com sucesso!");
          console.log("Usuário:", result.user);
        })
        .catch(error => {
          alert("Erro no login com Google: " + error.message);
        });
    }
  };
  
  // Disponibiliza o controlador globalmente
  window.AuthController = AuthController;
  