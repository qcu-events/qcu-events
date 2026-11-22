<?php
session_start();

$roles = [
    "organizer"   => ["redirect" => "organizerpage.html"],
    "participant" => ["redirect" => "participantpage.html"],
];

function respond($data, $status = 200) {
    http_response_code($status);
    header("Content-Type: application/json; charset=utf-8");
    header("Cache-Control: no-store");
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit();
}

function fail($message, $status = 400) {
    respond(["ok" => false, "error" => $message], $status);
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    fail("This action needs a POST request.", 405);
}

$role = $_POST["role"] ?? "";
if (!isset($roles[$role])) {
    fail("Please choose Participant or Organizer.");
}

$studentID = trim($_POST["studentID"] ?? "");
$email = trim($_POST["email"] ?? "");
$password = $_POST["password"] ?? "";

if ($studentID === "" || $email === "" || $password === "") {
    fail("Please complete all fields.");
}

require_once "connection.php";

$stmt = mysqli_prepare(
    $conn,
    "SELECT Student_Id, Email, Password, Role
     FROM log
     WHERE Student_Id = ?
     AND Email = ?
     AND Role = ?
     LIMIT 1"
);

if (!$stmt) {
    error_log(mysqli_error($conn));
    fail("Something went wrong. Please try again.", 500);
}

mysqli_stmt_bind_param($stmt, "sss", $studentID, $email, $role);
mysqli_stmt_execute($stmt);

$result = mysqli_stmt_get_result($stmt);
$account = mysqli_fetch_assoc($result);

mysqli_stmt_close($stmt);
mysqli_close($conn);

if (!$account || !password_verify($password, $account["Password"])) {
    fail("Invalid Student ID, Email, or Password.", 401);
}

session_regenerate_id(true);

$_SESSION["Student_Id"] = $account["Student_Id"];
$_SESSION["Email"] = $account["Email"];
$_SESSION["Role"] = $account["Role"];

if ($role === "organizer") {
    $_SESSION["Organizer_Id"] = $account["Student_Id"];
    $_SESSION["Organizer_Email"] = $account["Email"];
}

respond(["ok" => true, "redirect" => $roles[$role]["redirect"]]);
