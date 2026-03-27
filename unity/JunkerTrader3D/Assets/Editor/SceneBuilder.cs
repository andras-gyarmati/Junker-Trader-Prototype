#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

public static class SceneBuilder
{
    [MenuItem("Tools/Junker Trader/Create Main Scene")]
    public static void CreateMainScene()
    {
        var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);

        var existing = Object.FindFirstObjectByType<JunkerTraderGame>();
        if (existing == null)
        {
            var go = new GameObject("JunkerTraderGame");
            go.AddComponent<JunkerTraderGame>();
        }

        EditorSceneManager.MarkSceneDirty(scene);
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/Main.unity");
        AssetDatabase.SaveAssets();
        Debug.Log("Created Assets/Scenes/Main.unity");
    }

    public static void CreateMainSceneBatch()
    {
        CreateMainScene();
        EditorApplication.Exit(0);
    }
}
#endif
