const check = async () => {
    const res = await fetch("http://localhost:3000/api/scanner/status");
    const json = await res.json();
    console.log(json);
};
check();
