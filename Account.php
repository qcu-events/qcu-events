<?php

session_start();

$roles = ["organizer", "participant"];
$role = $_SESSION["Role"] ?? "";
$isLoggedIn = isset($_SESSION["Student_Id"]) && in_array($role, $roles, true);

// ---------- JSON profile data (replaces the missing account_data.php) ----------
if ($_SERVER["REQUEST_METHOD"] === "GET" && isset($_GET["data"])) {
    header("Content-Type: application/json; charset=utf-8");
    header("Cache-Control: no-store");

    if (!$isLoggedIn) {
        http_response_code(401);
        echo json_encode(["ok" => false, "error" => "Please log in first."]);
        exit();
    }

    $studentId = $_SESSION["Student_Id"];

    try {
        require_once "connection.php";
        $stmt = $conn->prepare(
            "SELECT Student_Id, Email, First_Name, Last_Name, Role
             FROM log
             WHERE Student_Id = ? AND Role = ?"
        );
        $stmt->bind_param("ss", $studentId, $role);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
    } catch (Throwable $e) {
        error_log($e->getMessage());
        http_response_code(500);
        echo json_encode(["ok" => false, "error" => "Unable to load your profile."]);
        exit();
    }

    if (!$row) {
        http_response_code(404);
        echo json_encode(["ok" => false, "error" => "Account not found."]);
        exit();
    }

    // Per-role labels and links used by account.html
    $isOrganizer = $role === "organizer";

    echo json_encode([
        "title"     => $isOrganizer ? "Organizer Account" : "Participant Account",
        "first"     => (string) $row["First_Name"],
        "last"      => (string) $row["Last_Name"],
        "email"     => (string) $row["Email"],
        "studentId" => (string) $row["Student_Id"],
        "idField"   => $isOrganizer ? "organizerId" : "studentId",
        "idLabel"   => $isOrganizer ? "Organizer ID" : "Student ID",
        "home"      => $isOrganizer ? "organizerpage.html" : "participantpage.html",
    ], JSON_UNESCAPED_UNICODE);
    exit();
}

if (!$isLoggedIn) {
    header("Location: login.php");
    exit();
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    header("Location: account.html");
    exit();
}

require_once "connection.php";

$studentId = $_SESSION["Student_Id"];
$roleName = ucfirst($role);

function fail($message) {
    header("Location: account.html?error=" . urlencode($message));
    exit();
}

$first = trim($_POST["first"] ?? "");
$last = trim($_POST["last"] ?? "");

$current = $_POST["current"] ?? "";
$new = $_POST["new"] ?? "";
$confirm = $_POST["confirm"] ?? "";

if (strlen($first) > 100 || strlen($last) > 100) {
    fail("Names must not exceed 100 characters.");
}

$stmt = $conn->prepare(
    "SELECT Password FROM log
     WHERE Student_Id = ? AND Role = ?"
);
$stmt->bind_param("ss", $studentId, $role);
$stmt->execute();
$account = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$account) {
    fail($roleName . " account not found.");
}

if ($current !== "" || $new !== "" || $confirm !== "") {

    if ($current === "" || $new === "" || $confirm === "") {
        fail("Complete all password fields.");
    }

    $storedPassword = (string) $account["Password"];
    $validPassword = password_verify($current, $storedPassword)
        || hash_equals($storedPassword, $current);

    if (!$validPassword) {
        fail("Incorrect current password.");
    }

    if ($new !== $confirm) {
        fail("New passwords do not match.");
    }

    if (strlen($new) < 8) {
        fail("Password must be at least 8 characters.");
    }

    $hashedPassword = password_hash($new, PASSWORD_DEFAULT);

    $stmt = $conn->prepare(
        "UPDATE log
         SET First_Name = ?, Last_Name = ?, Password = ?
         WHERE Student_Id = ? AND Role = ?"
    );
    $stmt->bind_param("sssss", $first, $last, $hashedPassword, $studentId, $role);

} else {

    $stmt = $conn->prepare(
        "UPDATE log
         SET First_Name = ?, Last_Name = ?
         WHERE Student_Id = ? AND Role = ?"
    );
    $stmt->bind_param("ssss", $first, $last, $studentId, $role);
}

if ($stmt->execute() && $stmt->affected_rows >= 0) {
    $_SESSION["First_Name"] = $first;
    $_SESSION["Last_Name"] = $last;

    $stmt->close();
    $conn->close();

    header("Location: account.html?success=1");
    exit();
}

$stmt->close();
$conn->close();
fail("Unable to save your profile.");