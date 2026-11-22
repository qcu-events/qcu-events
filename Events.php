<?php
session_start();
date_default_timezone_set("Asia/Manila");

require_once "connection.php";
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$conn->set_charset("utf8mb4");
$conn->query("SET time_zone = '+08:00'");

const CATEGORIES = ["academics", "non-academic", "sports"];
const MAX_PHOTO_BYTES = 5242880;

$uid = (string) ($_SESSION["Student_Id"] ?? "");
$role = $_SESSION["Role"] ?? "";
$sessionEmail = $_SESSION["Email"] ?? "";
$action = $_GET["action"] ?? "";
$isPost = $_SERVER["REQUEST_METHOD"] === "POST";

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

function requireLogin() {
    global $uid;
    if ($uid === "") {
        fail("Please log in first.", 401);
    }
}

function requireRole($want) {
    global $role;
    requireLogin();
    if ($role !== $want) {
        fail("You don't have permission to do that.", 403);
    }
}

function requirePost() {
    global $isPost;
    if (!$isPost) {
        fail("This action needs a POST request.", 405);
    }
}

function body() {
    static $data = null;
    if ($data === null) {
        $data = $_POST;
        if (stripos($_SERVER["CONTENT_TYPE"] ?? "", "application/json") === 0) {
            $decoded = json_decode(file_get_contents("php://input"), true);
            if (is_array($decoded)) {
                $data = $decoded;
            }
        }
    }
    return $data;
}

function textLength($value) {
    return function_exists("mb_strlen") ? mb_strlen($value, "UTF-8") : strlen($value);
}

function validFormat($value, $format) {
    $d = DateTime::createFromFormat($format, $value);
    return $d !== false && $d->format($format) === $value;
}

function isoTime($value) {
    $d = new DateTime($value, new DateTimeZone("Asia/Manila"));
    return $d->format("c");
}

function readFields() {
    $in = body();
    $f = [
        "category"     => (string) ($in["category"] ?? ""),
        "name"         => trim((string) ($in["name"] ?? "")),
        "about"        => trim((string) ($in["about"] ?? "")),
        "start"        => trim((string) ($in["date"] ?? "")),
        "end"          => trim((string) ($in["endDate"] ?? "")),
        "time"         => trim((string) ($in["time"] ?? "")),
        "venue"        => trim((string) ($in["venue"] ?? "")),
        "organization" => trim((string) ($in["organization"] ?? "")),
    ];

    if (!in_array($f["category"], CATEGORIES, true)) {
        fail("Please choose a valid category.");
    }
    if ($f["name"] === "" || textLength($f["name"]) > 150) {
        fail("Event name is required (150 characters max).");
    }
    if ($f["about"] === "" || textLength($f["about"]) > 5000) {
        fail("About the event is required (5000 characters max).");
    }
    if (!validFormat($f["start"], "Y-m-d")) {
        fail("Please enter a valid start date.");
    }
    if ($f["end"] === "") {
        $f["end"] = null;
    } else {
        if (!validFormat($f["end"], "Y-m-d")) {
            fail("Please enter a valid end date.");
        }
        if ($f["end"] < $f["start"]) {
            fail("The end date can't be before the start date.");
        }
    }
    if (!validFormat($f["time"], "H:i")) {
        fail("Please enter a valid event time.");
    }
    if ($f["venue"] === "" || textLength($f["venue"]) > 150) {
        fail("Event venue is required (150 characters max).");
    }
    if ($f["organization"] === "" || textLength($f["organization"]) > 150) {
        fail("Responsible organization is required (150 characters max).");
    }

    return $f;
}

function saveImage($file) {
    if (!is_array($file) || $file["error"] === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    if ($file["error"] !== UPLOAD_ERR_OK) {
        fail("The photo could not be uploaded. Try a smaller image.");
    }
    if ($file["size"] > MAX_PHOTO_BYTES) {
        fail("The photo must be 5 MB or smaller.");
    }

    $info = @getimagesize($file["tmp_name"]);
    $types = [
        IMAGETYPE_JPEG => "jpg",
        IMAGETYPE_PNG  => "png",
        IMAGETYPE_GIF  => "gif",
        IMAGETYPE_WEBP => "webp",
    ];
    if ($info === false || !isset($types[$info[2]])) {
        fail("The photo must be a JPG, PNG, GIF or WEBP image.");
    }

    $dir = __DIR__ . "/uploads";
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
        fail("The photo could not be saved.", 500);
    }

    $name = "event_" . bin2hex(random_bytes(8)) . "." . $types[$info[2]];
    if (!move_uploaded_file($file["tmp_name"], $dir . "/" . $name)) {
        fail("The photo could not be saved.", 500);
    }

    return "uploads/" . $name;
}

function removeImage($path) {
    if (is_string($path) && strpos($path, "uploads/event_") === 0) {
        $full = __DIR__ . "/uploads/" . basename($path);
        if (is_file($full)) {
            @unlink($full);
        }
    }
}

function shape($r, $uid, $role) {
    $out = [
        "id"              => (int) $r["id"],
        "category"        => $r["category"],
        "name"            => $r["name"],
        "about"           => $r["about"],
        "date"            => $r["start_date"],
        "endDate"         => $r["end_date"],
        "time"            => substr($r["event_time"], 0, 5),
        "venue"           => $r["venue"],
        "organization"    => $r["organization"],
        "photo"           => $r["photo"],
        "registeredCount" => (int) ($r["reg_count"] ?? 0),
        "isOwner"         => $role === "organizer" && (string) $r["organizer_id"] === $uid,
        "isRegistered"    => !empty($r["my_reg"]),
    ];
    if (isset($r["registered_at"])) {
        $out["registeredAt"] = isoTime($r["registered_at"]);
    }
    return $out;
}

function fetchRows($conn, $sql, $types, ...$params) {
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return $rows;
}

function findEvent($conn, $id) {
    $rows = fetchRows($conn, "SELECT * FROM events WHERE id = ?", "i", $id);
    return $rows[0] ?? null;
}

function eventId() {
    return (int) ($_GET["id"] ?? body()["id"] ?? 0);
}

function ownedEvent($conn, $uid) {
    requireRole("organizer");
    $row = findEvent($conn, eventId());
    if (!$row) {
        fail("Event not found.", 404);
    }
    if ((string) $row["organizer_id"] !== $uid) {
        fail("You can only manage events you created.", 403);
    }
    return $row;
}

const COUNT_SQL = "(SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) AS reg_count";
const MINE_SQL = "(SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.student_id = ?) AS my_reg";

try {
    switch ($action) {

        case "me":
            requireLogin();
            $rows = fetchRows(
                $conn,
                "SELECT Student_Id, Email, First_Name, Last_Name, Role FROM log WHERE Student_Id = ?",
                "s",
                $uid
            );
            if (!$rows) {
                fail("Please log in first.", 401);
            }
            respond([
                "ok"   => true,
                "user" => [
                    "studentId" => $rows[0]["Student_Id"],
                    "email"     => $rows[0]["Email"],
                    "first"     => $rows[0]["First_Name"],
                    "last"      => $rows[0]["Last_Name"],
                    "role"      => $rows[0]["Role"],
                ],
            ]);

        case "logout":
            requirePost();
            $_SESSION = [];
            if (ini_get("session.use_cookies")) {
                $p = session_get_cookie_params();
                setcookie(session_name(), "", time() - 42000, $p["path"], $p["domain"], $p["secure"], $p["httponly"]);
            }
            session_destroy();
            respond(["ok" => true]);

        case "list":
            $rows = fetchRows(
                $conn,
                "SELECT e.*, " . COUNT_SQL . ", " . MINE_SQL . "
                 FROM events e
                 ORDER BY e.id ASC",
                "s",
                $uid
            );
            respond(array_map(fn($r) => shape($r, $uid, $role), $rows));

        case "get":
            $rows = fetchRows(
                $conn,
                "SELECT e.*, " . COUNT_SQL . ", " . MINE_SQL . "
                 FROM events e
                 WHERE e.id = ?",
                "si",
                $uid,
                eventId()
            );
            if (!$rows) {
                fail("Event not found.", 404);
            }
            respond(shape($rows[0], $uid, $role));

        case "my-events":
            requireLogin();
            $rows = fetchRows(
                $conn,
                "SELECT e.*, " . COUNT_SQL . "
                 FROM events e
                 WHERE e.organizer_id = ?
                 ORDER BY e.start_date DESC, e.event_time DESC",
                "s",
                $uid
            );
            respond(array_map(fn($r) => shape($r, $uid, $role), $rows));

        case "my-registrations":
            requireLogin();
            $rows = fetchRows(
                $conn,
                "SELECT e.*, r.registered_at, 1 AS my_reg,
                        (SELECT COUNT(*) FROM registrations x WHERE x.event_id = e.id) AS reg_count
                 FROM registrations r
                 JOIN events e ON e.id = r.event_id
                 WHERE r.student_id = ?
                 ORDER BY r.registered_at DESC",
                "s",
                $uid
            );
            respond(array_map(fn($r) => shape($r, $uid, $role), $rows));

        case "create":
            requirePost();
            requireRole("organizer");
            $f = readFields();

            if ($f["start"] < date("Y-m-d")) {
                fail("The event date can't be in the past.");
            }

            $photo = saveImage($_FILES["photo"] ?? null);
            if ($photo === null) {
                fail("Please upload an event poster.");
            }

            try {
                $stmt = $conn->prepare(
                    "INSERT INTO events
                        (organizer_id, category, name, about, start_date, end_date,
                         event_time, venue, organization, photo)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                );
                $stmt->bind_param(
                    "ssssssssss",
                    $uid, $f["category"], $f["name"], $f["about"], $f["start"],
                    $f["end"], $f["time"], $f["venue"], $f["organization"], $photo
                );
                $stmt->execute();
                $newId = $conn->insert_id;
                $stmt->close();
            } catch (Throwable $e) {
                removeImage($photo);
                throw $e;
            }

            respond(["ok" => true, "id" => $newId], 201);

        case "update":
            requirePost();
            $row = ownedEvent($conn, $uid);
            $f = readFields();

            $photo = saveImage($_FILES["photo"] ?? null);
            $photoPath = $photo ?? $row["photo"];
            $eventId = (int) $row["id"];

            try {
                $stmt = $conn->prepare(
                    "UPDATE events
                     SET category = ?, name = ?, about = ?, start_date = ?, end_date = ?,
                         event_time = ?, venue = ?, organization = ?, photo = ?
                     WHERE id = ? AND organizer_id = ?"
                );
                $stmt->bind_param(
                    "sssssssssis",
                    $f["category"], $f["name"], $f["about"], $f["start"], $f["end"],
                    $f["time"], $f["venue"], $f["organization"], $photoPath,
                    $eventId, $uid
                );
                $stmt->execute();
                $stmt->close();
            } catch (Throwable $e) {
                if ($photo !== null) {
                    removeImage($photo);
                }
                throw $e;
            }

            if ($photo !== null) {
                removeImage($row["photo"]);
            }

            respond(["ok" => true, "id" => $eventId]);

        case "delete":
            requirePost();
            $row = ownedEvent($conn, $uid);

            $eventId = (int) $row["id"];
            $stmt = $conn->prepare("DELETE FROM events WHERE id = ? AND organizer_id = ?");
            $stmt->bind_param("is", $eventId, $uid);
            $stmt->execute();
            $stmt->close();

            removeImage($row["photo"]);

            respond(["ok" => true]);

        case "register":
            requirePost();
            requireRole("participant");

            $fullName = trim((string) (body()["fullName"] ?? ""));
            if ($fullName === "" || textLength($fullName) > 80) {
                fail("Please enter your full name (80 characters max).");
            }

            $eventId = eventId();
            $row = findEvent($conn, $eventId);
            if (!$row) {
                fail("Event not found.", 404);
            }

            $lastDay = $row["end_date"] ?? $row["start_date"];
            if ($lastDay < date("Y-m-d")) {
                fail("This event has already ended.");
            }

            try {
                $stmt = $conn->prepare(
                    "INSERT INTO registrations (event_id, student_id, full_name, email)
                     VALUES (?, ?, ?, ?)"
                );
                $stmt->bind_param("isss", $eventId, $uid, $fullName, $sessionEmail);
                $stmt->execute();
                $stmt->close();
            } catch (mysqli_sql_exception $e) {
                if ((int) $e->getCode() === 1062) {
                    fail("You are already registered for this event.", 409);
                }
                throw $e;
            }

            $count = fetchRows($conn, "SELECT COUNT(*) AS total FROM registrations WHERE event_id = ?", "i", $eventId);
            respond(["ok" => true, "registeredCount" => (int) $count[0]["total"]], 201);

        case "registrations":
            $row = ownedEvent($conn, $uid);

            $rows = fetchRows(
                $conn,
                "SELECT student_id, full_name, email, registered_at
                 FROM registrations
                 WHERE event_id = ?
                 ORDER BY registered_at ASC",
                "i",
                (int) $row["id"]
            );

            respond(array_map(fn($r) => [
                "name"         => $r["full_name"],
                "studentId"    => $r["student_id"],
                "email"        => $r["email"],
                "registeredAt" => isoTime($r["registered_at"]),
            ], $rows));

        default:
            fail("Unknown action.", 404);
    }
} catch (Throwable $e) {
    error_log($e->getMessage());
    fail("Debug: " . $e->getMessage(), 500);
}