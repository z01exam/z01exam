package backend

import "strings"

// Images officielles 01-edu, épinglées par digest. Le catalogue Zone01 ne
// donne que le nom d'une image (sous-entendu « la plus récente ») : sans
// épinglage, un serveur garde indéfiniment la copie téléchargée la première
// fois, et la correction diverge silencieusement de la plateforme.
//
// Les images module-* corrigent le cursus CDA ; test-go reste l'image Go par
// défaut (RUNNER_GO_DOCKER_IMAGE, préflight du déploiement).
// Mettre à jour une image : relever le digest du tag latest sur ghcr.io,
// le reporter ici et relancer les moulinettes de bout en bout.
var officialImages = map[string]string{
	"ghcr.io/01-edu/test-go":     "ghcr.io/01-edu/test-go@sha256:9c57c88e68f8937617a26d805396c775d5a88f43e214b91386986f89a9df13bf",
	"ghcr.io/01-edu/module-go":   "ghcr.io/01-edu/module-go@sha256:253a6b83f5208ed3c9ed010d0edde58a5d18004850aa4ca4b561c0cf6c9f19a1",
	"ghcr.io/01-edu/module-js":   "ghcr.io/01-edu/module-js@sha256:396ad8ac2c15608a946feb337e7f51a0555f3b7a06245e7e02ba8489abac1325",
	"ghcr.io/01-edu/module-rust": "ghcr.io/01-edu/module-rust@sha256:9ca5ae6054ac27683d67e261016c3f9d2029c5e6417bc12ea3bc48b1d1f317dd",
	"ghcr.io/01-edu/module-java": "ghcr.io/01-edu/module-java@sha256:0de34af00688443f99bce8648abd270b8a0646c429151e8513eeb106153fc347",
}

// pinnedImage renvoie la version épinglée d'une image officielle, qu'elle
// soit donnée nue, avec un tag ou déjà épinglée. Une image inconnue est
// renvoyée telle quelle.
func pinnedImage(image string) string {
	name := strings.TrimSpace(image)
	if at := strings.Index(name, "@"); at >= 0 {
		name = name[:at]
	}
	if slash := strings.LastIndex(name, "/"); slash >= 0 {
		if colon := strings.LastIndex(name, ":"); colon > slash {
			name = name[:colon]
		}
	}
	if pinned, ok := officialImages[name]; ok {
		return pinned
	}
	return strings.TrimSpace(image)
}

// officialImage renvoie l'image épinglée d'un nom de la table.
func officialImage(name string) string {
	return pinnedImage("ghcr.io/01-edu/" + name)
}
