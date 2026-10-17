package backend

import (
	"reflect"
	"sort"
	"strings"
	"testing"
)

func fileNames(files map[string]string) []string {
	var names []string
	for n := range files {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}

func TestJavaSourceFilesSingleClassKeepsTheCodeAsIs(t *testing.T) {
	code := "public class AnagramChecker {\n    public static boolean isAnagram(String a, String b) { return a.equals(b); }\n}\n"
	got := javaSourceFiles(code, "AnagramChecker.java")
	if !reflect.DeepEqual(fileNames(got), []string{"AnagramChecker.java"}) || !strings.Contains(got["AnagramChecker.java"], "isAnagram") {
		t.Fatalf("fichiers = %v", got)
	}
}

func TestJavaSourceFilesSplitsPublicTypes(t *testing.T) {
	code := `import java.util.*;
import java.util.function.Function;

// Une tâche.
public class Task {
    private String text = "}{ pas une accolade";
    char c = '}';
}

class Helper { /* } */ }

public class TodoList {
    List<Task> tasks = new ArrayList<>();
    String s = """
        texte } {
        """;
}
`
	got := javaSourceFiles(code, "TodoList.java")
	if want := []string{"Task.java", "TodoList.java"}; !reflect.DeepEqual(fileNames(got), want) {
		t.Fatalf("fichiers = %v, attendu %v", fileNames(got), want)
	}
	task, todo := got["Task.java"], got["TodoList.java"]
	for _, f := range []string{task, todo} {
		if !strings.HasPrefix(f, "import java.util.*;\nimport java.util.function.Function;\n\n") {
			t.Errorf("imports absents en tête :\n%s", f)
		}
	}
	if !strings.Contains(task, "// Une tâche.") || !strings.Contains(task, "class Helper") || strings.Contains(task, "TodoList") {
		t.Errorf("Task.java =\n%s", task)
	}
	if !strings.Contains(todo, "public class TodoList") || strings.Contains(todo, "class Helper") {
		t.Errorf("TodoList.java =\n%s", todo)
	}
}

func TestJavaSourceFilesHandlesInterfacesAndModifiers(t *testing.T) {
	code := "public interface Sorter { int[] sort(int[] a); }\n\npublic final class BubbleSort implements Sorter { public int[] sort(int[] a) { return a; } }\n\npublic abstract class Base {}\n"
	if got := fileNames(javaSourceFiles(code, "Sorter.java")); !reflect.DeepEqual(got, []string{"Base.java", "BubbleSort.java", "Sorter.java"}) {
		t.Fatalf("fichiers = %v", got)
	}
}

func TestJavaSourceFilesFallsBack(t *testing.T) {
	for name, code := range map[string]string{
		"sans type public":         "class Hidden {}\n",
		"accolades déséquilibrées": "public class A {\n",
		"package retiré":           "package student;\npublic class A {}\n",
	} {
		got := javaSourceFiles(code, "A.java")
		if _, ok := got["A.java"]; !ok || len(got) != 1 {
			t.Errorf("%s : fichiers = %v", name, fileNames(got))
		}
		if strings.Contains(got["A.java"], "package student") {
			t.Errorf("%s : la déclaration package doit être retirée", name)
		}
	}
}
