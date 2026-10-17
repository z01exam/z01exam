package backend

import (
	"regexp"
	"strings"
)

var (
	javaImportRe = regexp.MustCompile(`(?m)^[ \t]*(?:package|import)\b[^;\n]*;[ \t]*\r?\n?`)
	javaTypeRe   = regexp.MustCompile(`\b(class|interface|enum|record)\s+([A-Za-z_$][A-Za-z0-9_$]*)`)
	javaPublicRe = regexp.MustCompile(`\bpublic\b`)
)

// javaSourceFiles découpe un code Java en fichiers : un par type public de
// premier niveau, nommé d'après lui, avec les imports recopiés en tête. Les
// types non publics restent avec le type public qui les précède. Si le code
// ne contient aucun type public, ou si son découpage échoue (accolades
// déséquilibrées), il est écrit tel quel dans fallback.
func javaSourceFiles(code, fallback string) map[string]string {
	if !strings.HasSuffix(code, "\n") {
		code += "\n"
	}
	whole := map[string]string{fallback: code}

	// Les imports de premier niveau valent pour tous les fichiers ; une
	// déclaration package est retirée : les tests sont dans le paquet par
	// défaut.
	var imports []string
	for _, m := range javaImportRe.FindAllString(code, -1) {
		if strings.HasPrefix(strings.TrimSpace(m), "import") {
			imports = append(imports, strings.TrimRight(m, "\r\n"))
		}
	}
	body := javaImportRe.ReplaceAllString(code, "")

	segments, ok := javaTopLevelSegments(body)
	if !ok {
		return whole
	}

	type file struct {
		name   string
		chunks []string
	}
	var files []file
	var pending []string // types non publics avant le premier type public
	for _, seg := range segments {
		header := seg
		if brace := strings.Index(seg, "{"); brace >= 0 {
			header = seg[:brace]
		}
		header = stripJavaComments(header)
		m := javaTypeRe.FindStringSubmatchIndex(header)
		if m == nil {
			pending = append(pending, seg)
			continue
		}
		name := header[m[4]:m[5]]
		if javaPublicRe.MatchString(header[:m[0]]) {
			files = append(files, file{name: name + ".java", chunks: append(pending, seg)})
			pending = nil
			continue
		}
		if len(files) == 0 {
			pending = append(pending, seg)
		} else {
			files[len(files)-1].chunks = append(files[len(files)-1].chunks, seg)
		}
	}
	if len(files) == 0 {
		return whole
	}
	if len(pending) > 0 {
		files[len(files)-1].chunks = append(files[len(files)-1].chunks, pending...)
	}

	out := make(map[string]string, len(files))
	head := ""
	if len(imports) > 0 {
		head = strings.Join(imports, "\n") + "\n\n"
	}
	for _, f := range files {
		src := head + strings.TrimSpace(strings.Join(f.chunks, "\n")) + "\n"
		out[f.name] = src
	}
	return out
}

// javaTopLevelSegments découpe le code en déclarations de premier niveau, en
// ignorant les accolades des chaînes, caractères et commentaires.
func javaTopLevelSegments(code string) ([]string, bool) {
	var segments []string
	depth, start := 0, 0
	for i := 0; i < len(code); i++ {
		switch {
		case strings.HasPrefix(code[i:], "//"):
			if j := strings.IndexByte(code[i:], '\n'); j >= 0 {
				i += j
			} else {
				i = len(code)
			}
		case strings.HasPrefix(code[i:], "/*"):
			j := strings.Index(code[i+2:], "*/")
			if j < 0 {
				return nil, false
			}
			i += j + 3
		case strings.HasPrefix(code[i:], `"""`):
			j := strings.Index(code[i+3:], `"""`)
			if j < 0 {
				return nil, false
			}
			i += j + 5
		case code[i] == '"' || code[i] == '\'':
			quote := code[i]
			for i++; i < len(code) && code[i] != quote; i++ {
				if code[i] == '\\' {
					i++
				}
			}
		case code[i] == '{':
			depth++
		case code[i] == '}':
			depth--
			if depth < 0 {
				return nil, false
			}
			if depth == 0 {
				if seg := strings.TrimSpace(code[start : i+1]); seg != "" {
					segments = append(segments, seg)
				}
				start = i + 1
			}
		}
	}
	if depth != 0 {
		return nil, false
	}
	if rest := strings.TrimSpace(code[start:]); rest != "" {
		// Du texte après la dernière déclaration (hors commentaire) : on ne
		// devine pas, le code reste dans un seul fichier.
		if strings.TrimSpace(stripJavaComments(rest)) != "" {
			return nil, false
		}
	}
	return segments, true
}

var javaCommentRe = regexp.MustCompile(`(?s)//[^\n]*|/\*.*?\*/`)

func stripJavaComments(s string) string {
	return javaCommentRe.ReplaceAllString(s, " ")
}
