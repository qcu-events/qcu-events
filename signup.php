<?php
// Handles the sign-up form submitted from signup.html

// Opening signup.php directly just shows the form
if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    header("Location: signup.html");
    exit();
}

require_once "connection.php";

function back($error, $studentID, $email, $role) {
    $query = http_build_query([
        "error"     => $error,
        "studentID" => $studentID,
        "email"     => $email,
        "role"      => $role,
    ]);
    header("Location: signup.html?" . $query);
    exit();
}

$studentID = trim($_POST["studentID"] ?? "");
$email = trim($_POST["email"] ?? "");
$password = $_POST["password"] ?? "";
$role = $_POST["role"] ?? "";

if ($studentID === "") {
    back("Please enter your Student ID.", $studentID, $email, $role);
}
if (!preg_match('/^\d{2}-\d{4}$/D', $studentID)) {
    back("Invalid student number. Use the format 26-0000.", $studentID, $email, $role);
}
if ($email === "") {
    back("Please enter your email.", $studentID, $email, $role);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    back("Please enter a valid email address.", $studentID, $email, $role);
}
if ($password === "") {
    back("Please enter your password.", $studentID, $email, $role);
}
if (strlen($password) < 8) {
    back("Password must be at least 8 characters.", $studentID, $email, $role);
}
if (!in_array($role, ["participant", "organizer"], true)) {
    back("Please select a valid account type.", $studentID, $email, $role);
}

$check = mysqli_prepare(
    $conn,
    "SELECT Student_Id FROM log
     WHERE Student_Id = ? OR Email = ?"
);
mysqli_stmt_bind_param($check, "ss", $studentID, $email);
mysqli_stmt_execute($check);

$result = mysqli_stmt_get_result($check);
$exists = mysqli_num_rows($result) > 0;
mysqli_stmt_close($check);

if ($exists) {
    back("Student ID or Email is already registered.", $studentID, $email, $role);
}

$hashedPassword = password_hash($password, PASSWORD_DEFAULT);

$insert = mysqli_prepare(
    $conn,
    "INSERT INTO log (Student_Id, Email, Password, Role, First_Name, Last_Name)
     VALUES (?, ?, ?, ?, '', '')"
);
mysqli_stmt_bind_param($insert, "ssss", $studentID, $email, $hashedPassword, $role);

if (mysqli_stmt_execute($insert)) {
    mysqli_stmt_close($insert);
    mysqli_close($conn);

    header("Location: login.html?role=" . urlencode($role) . "&registered=1");
    exit();
}

mysqli_stmt_close($insert);
mysqli_close($conn);
back("Registration failed. Please try again.", $studentID, $email, $role);